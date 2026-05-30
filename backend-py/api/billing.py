from typing import Optional, Dict
from datetime import date
from enum import Enum
from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from models.company_configuration import (
    CompanyConfiguration,
    AddCompanyConfiguration,
    ServiceName,
    CompanyContractConfiguration,
    CompanyDetails,
)

from services.bigquery import BigQueryService
from services.transaction import TransactionService
from services.company import CompanyService


router = APIRouter(prefix="/api/billing")
company_service = CompanyService()
big_query_service = BigQueryService()
transaction_service = TransactionService(big_query_service)

class PeriodBasedFilter(Enum):
    MONTH = "MONTH"
    QUARTER = "QUARTER"
    YEAR = "YEAR"


class MonthlyBilling(BaseModel):
    period: str
    num_transactions: int
    total_payment: float

class BillingCalculationResult(BaseModel):
    company_id: str
    company_name: str
    target_month: date
    billing_model_applied: str
    calculation_status: str
    raw_database_counts: Dict[str, int]
    minimum_fee_enforced: float
    total_payment: float
    currency: str

# Helper Functions
def get_active_contract(config: CompanyConfiguration, target_date: date) -> CompanyContractConfiguration:
    """
        Scans the array of contracts and returns the specific one
        that was active during the requested billing month.
    """
    for contract in config.contract_configurations:
        if contract.contract_start_date <= target_date <= contract.contract_end_date:
            return contract

    raise HTTPException(
        status_code=404,
        detail=f"No active contract found for {target_date} in company {config.company_name}"
    )

# GET /api/billing/transactions
@router.get("/transactions", response_model=list[dict])
async def get_transactions(company_id: str) -> list[dict]:
    company = await company_service.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return transaction_service.get_transactions(company.company_id, company.contract_configurations[-1],
                                                       company.contract_configurations[-1].contract_start_date,
                                                       company.contract_configurations[
                                                           -1].contract_end_date)

# GET /api/billing/payment_table
@router.get("/payment_table", response_model=list[MonthlyBilling])
async def get_payment_table(company_id: str, time_filter: PeriodBasedFilter, service_name: Optional[ServiceName]= None) -> list[MonthlyBilling]:
    company = await company_service.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    transactions = transaction_service.get_transactions(company.company_id, company.contract_configurations[-1],
                                                       company.contract_configurations[-1].contract_start_date,
                                                       company.contract_configurations[
                                                           -1].contract_end_date)
    # TODO: calculate billing
    return [MonthlyBilling(period='2023-01', num_transactions=100, total_payment=500.0)]

