import json
import sys
import urllib.request

WEBHOOK_URL = "https://discord.com/api/webhooks/1568497756862029834/6aMtRbVz5nsmXu7c2zHxYQm7lXE_ijiDGuNF4pLFwtYzDqENMl5dqbFaRkbrpujK_ku2"

def send_notification(title: str, description: str, color: int = 0x0D99FF, fields: list = None):
    payload = {
        "embeds": [
            {
                "title": f"🎯 [DPA] {title}",
                "description": description,
                "color": color,
                "fields": fields or [],
                "footer": {
                    "text": "DOM Prompt Annotator — Multi-Agent Orchestrator (Argon)"
                }
            }
        ]
    }
    
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "DPA-Orchestrator"}
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Status: {resp.status}")
    except Exception as e:
        print(f"Failed to send webhook: {e}", file=sys.stderr)

if __name__ == "__main__":
    title_arg = sys.argv[1] if len(sys.argv) > 1 else "進捗通知"
    desc_arg = sys.argv[2] if len(sys.argv) > 2 else "処理が進行中です"
    send_notification(title_arg, desc_arg)
