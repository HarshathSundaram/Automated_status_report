from datetime import datetime
from .config import IST, PRIORITIES, AGE_BUCKETS


def format_report1(counts, completed_yesterday, new_tickets):
    today_str = datetime.now(IST).strftime("%d %b %Y")
    lines = [f"*📊 White Team Status Report — {today_str}*", ""]

    categories = [
        ("rently_bugs", "Rently Bugs"),
        ("smarthome_bugs", "Smarthome Bugs"),
        ("client_tasks", "Client Requests"),
    ]
    sections = [
        ("flag_added", "Flag Added (With Feature Team/Third party dependency)"),
        ("backlog", "Backlog"),
        ("in_progress", "In Progress"),
        ("ready_for_deploy", "Ready for Deploy"),
        ("verification", "Verification"),
    ]

    # Fixed width for the section column to accommodate the longer label
    sec_w = 56
    col_widths = [max(len(c[1]) + 2, 6) for c in categories]

    header = f"{'Section':<{sec_w}}" + "".join(f"{c[1]:^{col_widths[i]}}" for i, c in enumerate(categories))
    sep = "=" * len(header)
    thin_sep = "-" * len(header)

    lines.append(f"```\n{sep}")
    lines.append(header)
    lines.append(sep)

    for sec_key, sec_label in sections:
        row = f"{sec_label:<{sec_w}}" + "".join(
            f"{counts[cat_key][sec_key]:^{col_widths[i]}}" for i, (cat_key, _) in enumerate(categories)
        )
        lines.append(row)
        lines.append(thin_sep)

    lines.append("```")

    cat_totals = {cat_key: sum(counts[cat_key][s] for s, _ in sections) for cat_key, _ in categories}
    grand_total = sum(cat_totals.values())
    lines.append("")
    lines.append(f"🔴 *Rently Bugs Total:*      {cat_totals['rently_bugs']}")
    lines.append(f"🏠 *Smarthome Bugs Total:*   {cat_totals['smarthome_bugs']}")
    lines.append(f"📋 *Client Requests Total:*     {cat_totals['client_tasks']}")
    lines.append(f"📊 *Grand Total:*            {grand_total}")
    lines.append("")
    lines.append(f"✅ *Completed Yesterday:*    {completed_yesterday}")
    lines.append(f"🆕 *New Tickets:* {new_tickets}")

    return "\n".join(lines)


def format_report2(table):
    today_str = datetime.now(IST).strftime("%d %b %Y")
    lines = [f"*🐛 Open Bugs SLA Status — {today_str}*", ""]

    col_w = 10
    pri_w = 12
    header = f"{'Priority':<{pri_w}}" + "".join(f"{b:>{col_w}}" for b in AGE_BUCKETS)
    sep = "-" * len(header)
    lines.append(f"```\n{header}")
    lines.append(sep)
    for priority in PRIORITIES:
        row = f"{priority:<{pri_w}}" + "".join(f"{table[priority][b]:>{col_w}}" for b in AGE_BUCKETS)
        lines.append(row)
    lines.append("```")
    lines.append(f"*⚠️ Client Requests are not part of SLA*")

    return "\n".join(lines)
