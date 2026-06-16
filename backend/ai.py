import os
from openai import OpenAI

# Cheia se citeste din variabila de mediu OPENAI_API_KEY (niciodata in cod).
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def explain_data(insights):
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "user",
                "content": f"Explain this data in simple terms: {insights}"
            }
        ]
    )

    return response.choices[0].message.content