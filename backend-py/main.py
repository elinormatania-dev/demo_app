from fastapi import FastAPI
from api import router as api_router

app = FastAPI(title="Billing Dashboard API")

app.include_router(api_router)

@app.get("/")
def read_root():
    return {"status": "Server is running!"}