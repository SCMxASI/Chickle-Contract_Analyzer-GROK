from flask import Flask, request, jsonify
from flask_cors import CORS
import pdfplumber
from io import BytesIO
import re
import os
from groq import Groq

# -------------------- APP SETUP --------------------

app = Flask(__name__)
CORS(app)

# -------------------- GROQ CONFIG --------------------

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
MODEL_NAME = "llama-3.1-8b-instant"

# -------------------- UTILS --------------------

def clean_markdown(text: str) -> str:
    if not text:
        return ""

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Normalize bold markers
    text = re.sub(r'\*{3,}([^*]+)\*{3,}', r'**\1**', text)

    # Collapse multiple spaces and tabs inside lines
    text = re.sub(r'[ \t]+', ' ', text)

    # Strip leading/trailing spaces for each line
    lines = [line.lstrip() for line in text.split('\n')]

    # Remove empty lines
    cleaned = '\n'.join(line for line in lines if line.strip())

    return cleaned.strip()


# -------------------- AI QUERY --------------------

def query_ai_for_contract(query: str, is_file: bool = False) -> str:
    try:
        if not is_file:
            prompt = f"""
You are Chickle, an AI Contract Expert. Provide clear, structured, and legally sound responses.

Guidelines:
- Use ## for main sections and ### for subsections
- Use bullet points (-)
- Use **bold** for legal terms
- Be concise and professional
- No greetings unless user greets first

Rules:
- If the user greets, greet back
- Only answer contract-related questions
- If not contract-related, respond exactly with:
"⚠️ I focus only on contract-related queries.
## My Capabilities
    - Draft contracts
    - Analyze agreements
    - Identify risks
    - Improve clauses
    - Explain legal terms
Please use Chickle’s Legal Assistant instead:
👉 https://chicklelegalassistai.netlify.app 

    
    "

User query:
{query}
"""
        else:
            prompt = query

        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional legal contract analyst."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=1200
        )

        return clean_markdown(response.choices[0].message.content)

    except Exception as e:
        print("[ERROR] Groq API failure:", e)
        return "⚠️ AI service temporarily unavailable."

# -------------------- ROUTE --------------------

@app.route("/ask", methods=["POST"])
def ask_contract_ai():
    user_query = ""
    pdf_text = ""

    try:
        # -------- PDF REQUEST --------
        if request.content_type and request.content_type.startswith("multipart/form-data"):
            user_query = request.form.get("query", "").strip()
            file = request.files.get("file")

            if file and file.filename.lower().endswith(".pdf"):
                with pdfplumber.open(BytesIO(file.read())) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            pdf_text += text + "\n"

                pdf_text = pdf_text.strip()
                if not pdf_text:
                    return jsonify({"response": "⚠️ Empty or unreadable PDF."})

        # -------- JSON REQUEST --------
        else:
            data = request.get_json(silent=True) or {}
            user_query = data.get("query", "").strip()

        if not user_query:
            return jsonify({"error": "No query provided"}), 400

        lower = user_query.lower()
        print("[INFO] /ask →", user_query)

        # -------- BASIC RESPONSES --------
        if any(p in lower for p in ["who are you", "what is your name"]):
            response = "I am Chickle, your AI Contract Analyzer."

        elif "what can you do" in lower:
            response = """
## My Capabilities
- Draft contracts
- Analyze agreements
- Identify risks
- Improve clauses
- Explain legal terms
"""

        # -------- AI HANDLING --------
        else:
            if pdf_text:
                combined = f"""
Analyze the contract below and answer the question.

--- CONTRACT ---
{pdf_text}

--- QUESTION ---
{user_query}
"""
                response = query_ai_for_contract(combined, is_file=True)
            else:
                response = query_ai_for_contract(user_query)

    except Exception as e:
        print("[ERROR] Request failure:", e)
        response = "⚠️ Internal server error."

    response = clean_markdown(response)
    return jsonify({"response": response})

# -------------------- ENTRY --------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
