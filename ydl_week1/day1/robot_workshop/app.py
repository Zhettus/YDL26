"""
app.py — Robot Workshop Flask backend
Proxies LLM + image APIs so keys never reach the browser.

Endpoints
  GET  /api/contracts   → LLM generates 3 mission contracts to choose from
  GET  /api/contract    → LLM generates 1 contract (legacy, kept for compat)
  POST /api/review      → LLM writes an in-character build verdict
  POST /api/image       → text-to-image, saves PNG to static/assets/
  GET  /                → index.html
"""

import os, json, base64, requests
from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static")

LLM_BASE = os.getenv("BASE_URL", "https://llm.alem.ai")
LLM_KEY  = os.getenv("API_KEY",  "")
IMG_URL  = os.getenv("IMG_URL",  "https://llm.alem.ai/v1/images/generations")
IMG_KEY  = os.getenv("IMG_API_KEY", "")
LLM_ENDPOINT = f"{LLM_BASE}/v1/chat/completions"

FALLBACK_CONTRACT = {
    "title": "Line-Following Recycling Sorter",
    "description": "Follow a painted line across the warehouse floor and sort cans into bins.",
    "requires": {"torque": 10, "senses": ["line"], "maxPower": 12},
    "reward": 150, "difficulty": "medium",
}

FALLBACK_CONTRACTS = [
    {
        "title": "Floor Patrol Unit",
        "description": "Simple line-following robot to patrol the factory perimeter overnight.",
        "requires": {"torque": 5, "senses": ["line"], "maxPower": 8},
        "reward": 120, "difficulty": "easy",
    },
    {
        "title": "Recycling Sorter Mk II",
        "description": "Follow a conveyor line and use a gripper to sort recyclables into the correct colour-coded bins.",
        "requires": {"torque": 10, "senses": ["line", "grip"], "maxPower": 14},
        "reward": 210, "difficulty": "medium",
    },
    {
        "title": "Vision Assembly Bot",
        "description": "Identify components by camera, pick them up with precision, and place them on the assembly rig.",
        "requires": {"torque": 16, "senses": ["camera", "grip"], "maxPower": 16},
        "reward": 300, "difficulty": "hard",
    },
]


# ── LLM helper ────────────────────────────────────────────────────────────────

def llm_chat(messages: list) -> str:
    """POST to /v1/chat/completions. Prints full request + response for debugging."""
    headers = {"Authorization": f"Bearer {LLM_KEY}", "Content-Type": "application/json"}
    payload = {"model": "gemma4", "messages": messages}
    print("\n[LLM ▶]\n", json.dumps(payload, indent=2))
    r = requests.post(LLM_ENDPOINT, headers=headers, json=payload, timeout=30)
    print("[LLM ◀]\n", r.text)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]   # ← answer lives here


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/contracts")
def api_contracts():
    """Return an array of 3 contracts (easy / medium / hard) from the LLM."""
    prompt = (
        "Generate exactly 3 robot work contracts with different difficulty levels as a JSON array.\n"
        "Each element must have EXACTLY these keys:\n"
        '  title (string), description (string, 1 vivid sentence),\n'
        '  requires: { torque: <int 4-18>, senses: <subset of ["line","camera","grip"]>, maxPower: <int 7-18> },\n'
        '  reward: <int: 100-140 for easy, 180-230 for medium, 270-320 for hard>,\n'
        '  difficulty: "easy"|"medium"|"hard"\n'
        "Make them varied, funny, and specific. "
        "Output ONLY the JSON array — no markdown, no extra text."
    )
    try:
        raw   = llm_chat([{"role": "user", "content": prompt}])
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data  = json.loads(clean)
        if not isinstance(data, list) or len(data) < 3:
            raise ValueError("Need list of 3")
        return jsonify(data[:3])
    except Exception as e:
        print(f"[contracts] {e} → fallback")
        return jsonify(FALLBACK_CONTRACTS)


@app.get("/api/contract")
def api_contract():
    """Legacy single-contract endpoint — now just returns one fallback."""
    return jsonify(FALLBACK_CONTRACT)


@app.post("/api/review")
def api_review():
    """LLM writes a short in-character review of the build result."""
    body     = request.get_json()
    build    = body.get("build", [])
    passed   = body.get("passed", False)
    contract = body.get("contract", {})

    parts_str = ", ".join(p["name"] for p in build) or "nothing"
    outcome   = "PASSED" if passed else "FAILED"

    prompt = (
        "You are a grumpy but fair robot factory inspector.\n"
        f"Contract: {contract.get('description','')}\n"
        f"Builder used: {parts_str}\n"
        f"Result: {outcome}\n"
        "Write 2-3 sentences of sharp in-character feedback. "
        + ("Point out one specific missing part and why it matters." if not passed
           else "Congratulate them with your signature reluctant pride.")
    )
    try:
        return jsonify({"feedback": llm_chat([{"role": "user", "content": prompt}])})
    except Exception as e:
        print(f"[review] {e}")
        return jsonify({"feedback": "Inspector has gone for lunch. File a complaint with HR."})


@app.post("/api/image")
def api_image():
    """Generate a robot image, save to static/assets/, return the URL."""
    prompt_text = request.get_json().get("prompt", "a cute workshop robot")
    headers = {"Authorization": f"Bearer {IMG_KEY}", "Content-Type": "application/json"}
    payload = {"model": "text-to-image", "prompt": prompt_text, "n": 1, "size": "512x512"}
    print("\n[IMG ▶]\n", json.dumps(payload, indent=2))
    r = requests.post(IMG_URL, headers=headers, json=payload, timeout=60)
    print(f"[IMG ◀] status {r.status_code}")
    r.raise_for_status()
    b64 = r.json()["data"][0]["b64_json"]      # ← image lives here as base64
    os.makedirs("static/assets", exist_ok=True)
    path = "static/assets/robot_result.png"
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    return jsonify({"image_url": "/static/assets/robot_result.png"})


@app.get("/")
def root():
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5050)
