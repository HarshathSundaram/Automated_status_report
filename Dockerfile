FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code. Keep this explicit to avoid copying large dev artifacts.
COPY wt_report.py .
COPY wt_report_lib ./wt_report_lib

CMD ["python", "wt_report.py"]
