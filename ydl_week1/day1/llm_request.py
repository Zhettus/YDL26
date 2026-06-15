import requests
import os
from dotenv import load_dotenv   
load_dotenv()

BASE_URL = os.getenv("BASE_URL")   
API_KEY  = os.getenv("API_KEY")   

if not BASE_URL or not API_KEY:
    raise ValueError("Не найдены BASE_URL или API_KEY в файле .env")

QUESTION = input("Ваш вопрос: ")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}
body = {
    "model": "gemma4",
    "messages": [
        {
            "role": "user",
            "content": QUESTION,
        }
    ],
}

url = f"{BASE_URL}/v1/chat/completions"
print(f"Отправляю запрос на: {url}\n")

response = requests.post(url, headers=headers, json=body)

if response.status_code != 200:
    print(f"Ошибка! Статус: {response.status_code}")
    print(f"Текст ошибки: {response.text}")
else:
    data = response.json()

    print("=== Полный ответ от сервера (JSON) ===")
    print(data)
    print()

    # choices[0].message.content — текст ответа модели
    answer = data["choices"][0]["message"]["content"]
    print("=== Ответ модели ===")
    print(answer)
