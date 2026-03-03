/**
 * WT Board Daily Status Report — Google Apps Script
 *
 * Setup:
 *   1. Open any Google Sheet → Extensions → Apps Script
 *   2. Paste this entire file
 *   3. Go to Project Settings → Script Properties → Add the 4 properties below
 *   4. Run setupDailyTrigger() once to register the daily schedule
 *
 * Script Properties required:
 *   JIRA_BASE_URL      → https://rently.atlassian.net
 *   JIRA_EMAIL         → your-email@rently.com
 *   JIRA_API_TOKEN     → your Jira API token
 *   GCHAT_WEBHOOK_URL  → your Google Chat webhook URL
 */

// ─── Config ──────────────────────────────────────────────────────────────────

var BOARD_ID    = 21;
var PRIORITIES  = ["Code Red", "Highest", "High", "Medium", "Low", "Information"];
var AGE_BUCKETS = ["0-1 days", "2-3 days", "4-5 days", "6-10 days", ">10 days"];
var SECTION_KEYS = ["flag_added", "backlog", "in_progress", "ready_for_deploy", "verification"];
var CAT_KEYS     = ["rently_bugs", "smarthome_bugs", "client_tasks"];

var SF_NOT_EMPTY = 'cf[10952] is not EMPTY';
var UNRESOLVED   = 'resolution is EMPTY';
var BASE_ACTIVE  = SF_NOT_EMPTY + ' AND ' + UNRESOLVED;

// ─── Entry point (called by time trigger) ────────────────────────────────────

function runDailyReport() {
  var props        = PropertiesService.getScriptProperties().getProperties();
  var baseUrl      = props.JIRA_BASE_URL;
  var email        = props.JIRA_EMAIL;
  var token        = props.JIRA_API_TOKEN;
  var webhookUrl   = props.GCHAT_WEBHOOK_URL;

  if (!baseUrl || !email || !token || !webhookUrl) {
    Logger.log("ERROR: Missing Script Properties. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, GCHAT_WEBHOOK_URL.");
    return;
  }

  Logger.log("=== Run started (Board " + BOARD_ID + ") ===");

  var window      = getReportWindow();
  var winStart    = formatISTDate(window.yesterday10am);
  var winEnd      = formatISTDate(window.today10am);

  // ── Report 1 ──
  Logger.log("Report 1 — fetching section data...");
  var sectionJql = {
    flag_added:       BASE_ACTIVE + ' AND cf[10003] is not EMPTY AND status in ("Current Backlog", "Backlog")',
    backlog:          BASE_ACTIVE + ' AND cf[10003] is EMPTY AND status in ("Current Backlog", "Backlog")',
    in_progress:      BASE_ACTIVE + ' AND status in ("In Progress", "In Code Review", "For QE Verification")',
    ready_for_deploy: BASE_ACTIVE + ' AND status = "Ready for Deployment"',
    verification:     BASE_ACTIVE + ' AND status = "In Verification"'
  };

  var counts = {};
  CAT_KEYS.forEach(function(c) {
    counts[c] = {};
    SECTION_KEYS.forEach(function(s) { counts[c][s] = 0; });
  });

  for (var secKey in sectionJql) {
    var issues = fetchIssues(baseUrl, email, token, sectionJql[secKey], "issuetype,labels");
    issues.forEach(function(raw) {
      var cat = categorize(raw);
      counts[cat][secKey]++;
    });
    Logger.log("  [" + secKey + "] done");
  }

  var completedYesterday = fetchCount(baseUrl, email, token,
    SF_NOT_EMPTY + ' AND resolutionDate >= "' + winStart + '" AND resolutionDate < "' + winEnd + '"');
  var newTickets = fetchCount(baseUrl, email, token,
    SF_NOT_EMPTY + ' AND created >= "' + winStart + '" AND created < "' + winEnd + '"');

  Logger.log("Report 1 computed successfully.");

  // ── Report 2 ──
  Logger.log("Report 2 — fetching bug data...");
  var bugJql    = SF_NOT_EMPTY + ' AND ' + UNRESOLVED + ' AND issuetype = Bug';
  var bugIssues = fetchIssues(baseUrl, email, token, bugJql, "priority,created");

  var table = {};
  PRIORITIES.forEach(function(p) {
    table[p] = {};
    AGE_BUCKETS.forEach(function(b) { table[p][b] = 0; });
  });

  bugIssues.forEach(function(raw) {
    var f       = raw.fields;
    var pri     = (f.priority && f.priority.name) ? f.priority.name : "Medium";
    var matched = PRIORITIES.filter(function(p) { return p.toLowerCase() === pri.toLowerCase(); })[0] || "Medium";
    var created = new Date(f.created);
    var days    = Math.floor((new Date() - created) / (1000 * 60 * 60 * 24));
    table[matched][ageBucket(days)]++;
  });

  Logger.log("Report 2 computed successfully.");

  // ── Post to Google Chat ──
  var report1 = formatReport1(counts, completedYesterday, newTickets);
  var report2 = formatReport2(table);

  Logger.log("Posting Report 1 to Google Chat...");
  postToChat(webhookUrl, report1);

  Logger.log("Posting Report 2 to Google Chat...");
  postToChat(webhookUrl, report2);

  Logger.log("=== Run completed successfully ===");
}

// ─── Jira API helpers ─────────────────────────────────────────────────────────

function fetchIssues(baseUrl, email, token, jql, fields) {
  var allIssues = [];
  var startAt   = 0;
  var pageSize  = 100;

  do {
    var url = baseUrl + "/rest/agile/1.0/board/" + BOARD_ID + "/issue"
            + "?jql=" + encodeURIComponent(jql)
            + "&fields=" + encodeURIComponent(fields)
            + "&maxResults=" + pageSize
            + "&startAt=" + startAt;

    var resp   = jiraGet(url, email, token);
    var issues = resp.issues || [];
    allIssues  = allIssues.concat(issues);
    startAt   += issues.length;

    if (issues.length < pageSize) break;
  } while (true);

  return allIssues;
}

function fetchCount(baseUrl, email, token, jql) {
  var url = baseUrl + "/rest/agile/1.0/board/" + BOARD_ID + "/issue"
          + "?jql=" + encodeURIComponent(jql)
          + "&maxResults=0";
  var resp = jiraGet(url, email, token);
  return resp.total || 0;
}

function jiraGet(url, email, token) {
  var creds   = Utilities.base64Encode(email + ":" + token);
  var options = {
    method: "get",
    headers: { "Authorization": "Basic " + creds, "Accept": "application/json" },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Jira API error " + response.getResponseCode() + ": " + response.getContentText().substring(0, 200));
    return { issues: [], total: 0 };
  }
  return JSON.parse(response.getContentText());
}

function postToChat(webhookUrl, text) {
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(webhookUrl, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Google Chat error: " + response.getContentText());
  }
}

// ─── Categorize issue ─────────────────────────────────────────────────────────

function categorize(raw) {
  var f         = raw.fields;
  var issueType = ((f.issuetype && f.issuetype.name) || "").toLowerCase();
  var labels    = (f.labels || []).map(function(l) { return l.toUpperCase(); });
  if (issueType === "bug") {
    return labels.indexOf("SMARTHOME") !== -1 ? "smarthome_bugs" : "rently_bugs";
  }
  return "client_tasks";
}

// ─── Date helpers (IST) ───────────────────────────────────────────────────────

function getReportWindow() {
  // IST = UTC+5:30
  var nowUTC        = new Date();
  var istOffset     = 5.5 * 60 * 60 * 1000;
  var nowIST        = new Date(nowUTC.getTime() + istOffset);

  var today10am     = new Date(nowIST);
  today10am.setHours(10, 0, 0, 0);

  var yesterday10am = new Date(today10am.getTime() - 24 * 60 * 60 * 1000);

  return { yesterday10am: yesterday10am, today10am: today10am };
}

function formatISTDate(d) {
  var pad = function(n) { return n < 10 ? "0" + n : "" + n; };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
       + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function ageBucket(days) {
  if (days <= 1)  return "0-1 days";
  if (days <= 3)  return "2-3 days";
  if (days <= 5)  return "4-5 days";
  if (days <= 10) return "6-10 days";
  return ">10 days";
}

// ─── Report formatters ────────────────────────────────────────────────────────

function formatReport1(counts, completedYesterday, newTickets) {
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Kolkata", "dd MMM yyyy");
  var lines   = ["*📊 White Team Status Report — " + dateStr + "*", ""];

  var categories = [
    { key: "rently_bugs",    label: "Rently Bugs"     },
    { key: "smarthome_bugs", label: "Smarthome Bugs"  },
    { key: "client_tasks",   label: "Client Requests" }
  ];
  var sections = [
    { key: "flag_added",       label: "Flag Added",       multiline: ["Flag Added", "(With Feature Team", "/3rd Party Dependency)"] },
    { key: "backlog",          label: "Backlog"          },
    { key: "in_progress",      label: "In Progress"      },
    { key: "ready_for_deploy", label: "Ready for Deploy" },
    { key: "verification",     label: "Verification"     }
  ];

  var secW  = 18;
  var colW  = 15;

  var header = padR("Section", secW) + categories.map(function(c) { return padC(c.label, colW); }).join("");
  var sep    = repeat("=", header.length);
  var thin   = repeat("-", header.length);

  lines.push("```");
  lines.push(sep);
  lines.push(header);
  lines.push(sep);

  sections.forEach(function(sec) {
    var displayLabel = sec.label;
    var row = padR(displayLabel, secW) + categories.map(function(cat) {
      return padC(String(counts[cat.key][sec.key]), colW);
    }).join("");
    lines.push(row);
    
    // If multiline label, print additional lines
    if (sec.multiline) {
      for (var i = 1; i < sec.multiline.length; i++) {
        lines.push(padR(sec.multiline[i], secW) + repeat(" ", header.length - secW));
      }
    }
    
    lines.push(thin);
  });

  // Add total row
  var totalRow = padR("TOTAL", secW) + categories.map(function(cat) {
    var total = SECTION_KEYS.reduce(function(sum, s) { return sum + counts[cat.key][s]; }, 0);
    return padC(String(total), colW);
  }).join("");
  lines.push(totalRow);
  lines.push(sep);

  lines.push("```");
  lines.push("");

  var catTotals = {};
  categories.forEach(function(cat) {
    catTotals[cat.key] = SECTION_KEYS.reduce(function(sum, s) { return sum + counts[cat.key][s]; }, 0);
  });
  var grandTotal = Object.keys(catTotals).reduce(function(sum, k) { return sum + catTotals[k]; }, 0);

  lines.push("📊 *Grand Total:*            " + grandTotal);
  lines.push("");
  lines.push("✅ *Completed Yesterday:*    " + completedYesterday);
  lines.push("🆕 *New Tickets:*            " + newTickets);

  return lines.join("\n");
}

function formatReport2(table) {
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Kolkata", "dd MMM yyyy");
  var lines   = ["*🐛 Open Bugs SLA Status — " + dateStr + "*", ""];

  var priW  = 12;
  var colW  = 10;
  var header = padR("Priority", priW) + AGE_BUCKETS.map(function(b) { return padL(b, colW); }).join("");
  var sep    = repeat("-", header.length);

  lines.push("```");
  lines.push(header);
  lines.push(sep);

  PRIORITIES.forEach(function(p) {
    var row = padR(p, priW) + AGE_BUCKETS.map(function(b) { return padL(String(table[p][b]), colW); }).join("");
    lines.push(row);
  });

  lines.push("```");
  lines.push("*⚠️ Client Requests are not part of SLA*");

  return lines.join("\n");
}

// ─── String helpers ───────────────────────────────────────────────────────────

function padR(s, w) { s = String(s); return s + repeat(" ", Math.max(0, w - s.length)); }
function padL(s, w) { s = String(s); return repeat(" ", Math.max(0, w - s.length)) + s; }
function padC(s, w) {
  s = String(s);
  var total = Math.max(0, w - s.length);
  var left  = Math.floor(total / 2);
  return repeat(" ", left) + s + repeat(" ", total - left);
}
function repeat(ch, n) { var r = ""; for (var i = 0; i < n; i++) r += ch; return r; }

// ─── One-time trigger setup ───────────────────────────────────────────────────

/**
 * Run this function ONCE from the Apps Script editor to register the daily trigger.
 * After that, runDailyReport() fires automatically every day at 10:00–11:00 AM IST.
 *
 * IMPORTANT: First set the Google Sheet timezone to Asia/Kolkata:
 *   File → Settings → Time zone → (UTC+05:30) India Standard Time
 */
function setupDailyTrigger() {
  // Remove any existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "runDailyReport") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("runDailyReport")
    .timeBased()
    .everyDays(1)
    .atHour(10)   // 10:00–11:00 AM in sheet timezone (set to Asia/Kolkata)
    .create();

  Logger.log("✅ Daily trigger registered. Fires at 10:00–11:00 AM IST every day.");
}
