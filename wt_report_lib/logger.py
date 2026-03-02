from datetime import datetime
from .config import IST


def log(msg, file=None):
    line = f"[{datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}] {msg}"
    print(line)
    if file:
        file.write(line + "\n")
        file.flush()
