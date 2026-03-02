import requests
from .config import GCHAT_WEBHOOK_URL


def post_to_gchat(text):
    resp = requests.post(GCHAT_WEBHOOK_URL, json={"text": text}, timeout=15)
    resp.raise_for_status()
