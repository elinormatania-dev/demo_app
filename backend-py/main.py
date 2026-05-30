from fastapi import FastAPI
from api.company import router as company_router
from api.billing import router as billing_router

app = FastAPI(title="Billing Dashboard API")

app.include_router(company_router)
app.include_router(billing_router)

@app.get("/")
def read_root():
    return {"status": "Server is running!"}