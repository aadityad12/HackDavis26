import json
import re


def extract_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    m = re.search(r"\{.*?\}", text, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError("no JSON in response")
