# Automated Status Report (wt-daily-report)

A small utility to generate automated daily status reports.

**Repository**: Automated_status_report
**Owner**: HarshathSundaram

# Automated Status Report (wt-daily-report)

A small utility to generate automated daily status reports.

**Repository**: Automated_status_report
**Owner**: HarshathSundaram

**What it does:**
- Runs `wt_report.py` to produce status output and save logs to the `logs/` directory.

**Files of interest**
- [wt_report.py](wt_report.py) - main script that generates the report
- [Dockerfile](Dockerfile) - container definition
- [requirements.txt](requirements.txt) - Python dependencies
- `logs/` - directory where runtime logs are written

**Prerequisites**
- Python 3.8+ and `pip`
- (Optional) Docker for container runs

**Install**
```bash
pip install -r requirements.txt
```

**Run locally**
```bash
python wt_report.py
```

**Run with Docker**
```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)/logs":/app/logs wt-daily-report
```

**Logs**
- Runtime output and generated reports are placed in the `logs/` directory.

**Notes**
- No explicit configuration file is required by default; check `wt_report.py` for environment-specific options.

## Examples

### 1) Quick run (local)
Run the script directly:

```bash
python wt_report.py
```

Sample console output (example):

```
2026-03-02 09:00:00 INFO Generating daily status report
Report saved to logs/report_2026-03-02.txt
```

### 2) Inspect a generated report
Open a report file written to `logs/`, e.g. `logs/report_2026-03-02.txt`.

Example contents:

```
Date: 2026-03-02
Summary:
- Completed tasks: 3
- In progress: 2
- Blockers: None
```

### 3) Run in Docker (mount logs)
Build and run the image with host-mounted `logs/` so reports persist:

```bash
docker build -t wt-daily-report .
docker run --rm -v "$(pwd)/logs":/app/logs \
	-e TZ=UTC \
	wt-daily-report
```

### 4) Troubleshooting
- If you see missing dependencies, run `pip install -r requirements.txt`.
- If the container can't write to `logs/`, ensure the host `logs/` directory exists and has write permissions.

---

If you'd like, I can add a short `docker-compose.yml`, a CI job to lint/format, or expand examples with real sample outputs produced by `wt_report.py`.
