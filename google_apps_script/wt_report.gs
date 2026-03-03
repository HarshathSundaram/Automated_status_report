/**
 * WT Board Daily Status Report — Google Apps Script (HTML Tables as Images)
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
  var report1Html = formatReport1(counts, completedYesterday, newTickets);
  var report2Html = formatReport2(table);

  Logger.log("Posting Report 1 to Google Chat...");
  postToChat(webhookUrl, report1Html, "Report 1 — Status");

  Logger.log("Posting Report 2 to Google Chat...");
  postToChat(webhookUrl, report2Html, "Report 2 — SLA");

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

function postToChat(webhookUrl, htmlContent, title) {
  // Convert HTML table to image using external API (currently disabled due to reliability)
  var imageUrl = convertHtmlToImage(htmlContent);
  
  var payload;
  if (imageUrl) {
    // If image conversion works, post the image
    payload = {
      text: "📊 " + title,
      attachments: [{
        image_url: imageUrl
      }]
    };
  } else {
    // Fallback: Convert HTML to formatted text for Google Chat
    // This extracts table data and formats it nicely
    var textContent = htmlToFormattedText(htmlContent);
    payload = {
      text: textContent
    };
  }
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(webhookUrl, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Google Chat error: " + response.getContentText());
  }
}

function htmlToFormattedText(htmlContent) {
  // Extract table data from HTML and format as readable text for Google Chat
  // This regex-based approach works for the standard table structure we generate
  
  try {
    // Extract title/date from the first cell (special case)
    var titleMatch = htmlContent.match(/<td[^>]*>([^<]*\s—\s[^<]*)<\/td>/);
    var titleLine = titleMatch ? titleMatch[1] : "";
    
    // Extract all rows
    var rows = [];
    var rowMatches = htmlContent.match(/<tr[^>]*>.*?<\/tr>/g);
    
    if (!rowMatches) return htmlContent; // Fallback to raw if regex fails
    
    rowMatches.forEach(function(rowHtml) {
      var cells = [];
      var cellMatches = rowHtml.match(/<td[^>]*>([^<]*)<\/td>/g);
      
      if (cellMatches) {
        cellMatches.forEach(function(cellHtml) {
          var cellContent = cellHtml.replace(/<[^>]*>/g, "").trim();
          cells.push(cellContent);
        });
        rows.push(cells);
      }
    });
    
    // Format as fixed-width text table
    if (rows.length === 0) return htmlContent;
    
    var lines = [];
    
    // Add header if title exists
    if (titleLine) {
      lines.push("*" + titleLine + "*");
      lines.push("");
    }
    
    // Skip the first row if it contains the title (header row)
    var startIdx = titleLine && rows[0].length > 0 && rows[0][0].indexOf("—") !== -1 ? 1 : 0;
    var dataRows = rows.slice(startIdx);
    
    if (dataRows.length === 0) return htmlContent;
    
    // Format each row with padding for alignment
    var colWidths = [];
    for (var c = 0; c < dataRows[0].length; c++) {
      var maxWidth = 0;
      for (var r = 0; r < dataRows.length; r++) {
        if (dataRows[r][c]) maxWidth = Math.max(maxWidth, dataRows[r][c].length);
      }
      colWidths.push(Math.min(maxWidth + 2, 20)); // Cap at 20 for readability
    }
    
    // Print header separator
    var separator = "";
    for (var i = 0; i < colWidths.length; i++) {
      separator += "---" + (i < colWidths.length - 1 ? " | " : "");
    }
    lines.push(separator);
    
    // Print data rows
    dataRows.forEach(function(row, idx) {
      var line = "";
      for (var c = 0; c < row.length; c++) {
        var cellVal = row[c] || "";
        line += padRight(cellVal, colWidths[c]);
        if (c < row.length - 1) line += " | ";
      }
      lines.push(line);
      
      // Add separator after header (first data row)
      if (idx === 0) {
        lines.push(separator);
      }
    });
    
    // Add final separator
    lines.push(separator);
    
    // Extract metrics (Completed Yesterday, New Tickets)
    var metricsMatch = htmlContent.match(/<strong>([^<]*)<\/strong>\s*(\d+)/g);
    if (metricsMatch) {
      lines.push("");
      metricsMatch.forEach(function(metric) {
        // Extract label and number from "label: number" format
        var parts = metric.match(/<strong>([^<]*)<\/strong>\s*(\d+)/);
        if (parts) {
          var label = parts[1].replace(/:\s*$/, "");  // Remove trailing colon if present
          lines.push(label + ": " + parts[2]);
        }
      });
    }
    
    return "`" + lines.join("\n") + "`";
    
  } catch (e) {
    Logger.log("HTML to text conversion error: " + e.toString());
    return htmlContent; // Fallback to raw HTML if parsing fails
  }
}

function padRight(str, len) {
  str = String(str);
  while (str.length < len) str += " ";
  return str;
}

function convertHtmlToImage(htmlContent) {
  // HTML to Image conversion via external APIs is unreliable in Google Apps Script
  // The htmltoimage.app service may have CORS issues or authentication requirements
  // 
  // Future approach: Store HTML on Google Drive temporarily and export as PNG,
  // or use a paid service with proper API key handling
  // 
  // For now, returning null will trigger the formatted text fallback in postToChat()
  
  Logger.log("Image conversion currently disabled (API reliability issues)");
  return null;
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

// ─── Report formatters (HTML tables) ──────────────────────────────────────────

function formatReport1(counts, completedYesterday, newTickets) {
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Kolkata", "dd MMM yyyy");

  var categories = [
    { key: "rently_bugs",    label: "Rently"          },
    { key: "smarthome_bugs", label: "Smart Home"      },
    { key: "client_tasks",   label: "Client Requests" }
  ];
  var sections = [
    { key: "flag_added",       label: "With Feature Team" },
    { key: "backlog",          label: "Backlog"           },
    { key: "in_progress",      label: "Work in Progress"  },
    { key: "ready_for_deploy", label: "Production Ready"  },
    { key: "verification",     label: "Verification"      }
  ];

  // Build HTML table
  var html = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-family:Arial; font-size:12px;">';
  
  // Header row
  html += '<tr style="background-color:#4472C4; color:white;">';
  html += '<td style="font-weight:bold; padding:10px;">' + dateStr + ' — White Team Status</td>';
  categories.forEach(function(cat) {
    html += '<td style="font-weight:bold; text-align:center; padding:10px;">' + cat.label + '</td>';
  });
  html += '<td style="font-weight:bold; text-align:center; padding:10px;">Total</td>';
  html += '</tr>';

  // Section rows
  sections.forEach(function(sec, idx) {
    var bgColor = idx % 2 === 0 ? "#D9E1F2" : "#FFFFFF";
    html += '<tr style="background-color:' + bgColor + ';">';
    html += '<td style="font-weight:bold; padding:10px;">' + sec.label + '</td>';
    var rowTotal = 0;
    categories.forEach(function(cat) {
      var val = counts[cat.key][sec.key];
      rowTotal += val;
      html += '<td style="text-align:center; padding:10px;">' + val + '</td>';
    });
    html += '<td style="font-weight:bold; text-align:center; padding:10px;">' + rowTotal + '</td>';
    html += '</tr>';
  });

  // Totals row
  html += '<tr style="background-color:#FFC7CE; font-weight:bold;">';
  html += '<td style="padding:10px;">TOTAL</td>';
  var colTotals = {};
  categories.forEach(function(cat) {
    colTotals[cat.key] = SECTION_KEYS.reduce(function(sum, s) { return sum + counts[cat.key][s]; }, 0);
  });
  var grandTotal = Object.keys(colTotals).reduce(function(sum, k) { return sum + colTotals[k]; }, 0);
  categories.forEach(function(cat) {
    html += '<td style="text-align:center; padding:10px;">' + colTotals[cat.key] + '</td>';
  });
  html += '<td style="text-align:center; padding:10px;">' + grandTotal + '</td>';
  html += '</tr>';

  html += '</table>';
  html += '<br/><div style="font-size:12px; font-family:Arial;">';
  html += '<strong>Completed Yesterday:</strong> ' + completedYesterday + ' &nbsp; | &nbsp; <strong>New Tickets:</strong> ' + newTickets;
  html += '</div>';

  return html;
}

function formatReport2(table) {
  var now     = new Date();
  var dateStr = Utilities.formatDate(now, "Asia/Kolkata", "dd MMM yyyy");

  // Build HTML table
  var html = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; font-family:Arial; font-size:12px;">';
  
  // Header row
  html += '<tr style="background-color:#70AD47; color:white;">';
  html += '<td style="font-weight:bold; padding:10px;">🐛 Open Bugs SLA — ' + dateStr + '</td>';
  AGE_BUCKETS.forEach(function(b) {
    html += '<td style="font-weight:bold; text-align:center; padding:10px;">' + b + '</td>';
  });
  html += '</tr>';

  // Priority rows
  PRIORITIES.forEach(function(p, idx) {
    var bgColor = idx % 2 === 0 ? "#E2EFDA" : "#FFFFFF";
    html += '<tr style="background-color:' + bgColor + ';">';
    html += '<td style="font-weight:bold; padding:10px;">' + p + '</td>';
    AGE_BUCKETS.forEach(function(b) {
      var val = table[p][b];
      html += '<td style="text-align:center; padding:10px;">' + val + '</td>';
    });
    html += '</tr>';
  });

  html += '</table>';
  html += '<br/><div style="font-size:12px; font-family:Arial;">';
  html += '<strong>⚠️ Client Requests are not part of SLA</strong>';
  html += '</div>';

  return html;
}

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
    .atHour(10)
    .create();

  Logger.log("✅ Daily trigger registered. Fires at 10:00–11:00 AM IST every day.");
}
