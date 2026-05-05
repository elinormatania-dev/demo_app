import uuid
import calendar
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
    BillingModel,
    CalculationResult
)

from services.big_query_service import BigQueryService
from services.company_service import CompanyService
from services.payment_service import PaymentService


router = APIRouter()
company_service = CompanyService()
big_query_service = BigQueryService()

class PeriodBasedFilter(Enum):
    MONTH = "MONTH"
    QUARTER = "QUARTER"
    YEAR = "YEAR"


class MonthlyBilling(BaseModel):
    period: str
    num_transactions: int
    total_payment: float

class CompanyDetails(BaseModel): 
    id: str
    name: str

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
def get_active_contract(config: CompanyConfiguration, target_date) -> CompanyContractConfiguration:
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

async def execute_bq_query(query: str) -> Dict[str, int]:
    """
    MOCK: This is where you will connect the official google-cloud-bigquery client!
    For now, it returns dummy data so you can test the Python math engine.
    """
    # In production:
    # client = bigquery.Client()
    # return client.query(query).to_dataframe().to_dict('records')[0]

    print(f"Executing SQL:\n{query}")
    return {"ocr_ended_count": 15000, "liveness_started_count": 12000, "bio_ended_count": 12000}


# Billing Endpoints
@router.post("/api/billing/calculate", response_model=BillingCalculationResult)
async def calculate_monthly_billing(request: BillingCalculationResult):
    """
    the core engine . take a company and a month extract the relevant data from the database and calculate the billing.
    :param request:
    :return:
    """
    # 1. Fetch the company configuration
    company_config = await company_service.get_company(request.company_id)
    if not company_config:
        raise HTTPException(status_code=404, detail="Company configuration not found")
    # TODO: Complete implementation

## main page
# GET /api/payment_table
@router.get("/api/payment_table", response_model=list[MonthlyBilling])
async def get_payment_table(company_id: str, time_filter: PeriodBasedFilter, service_name: Optional[ServiceName]= None) -> list[MonthlyBilling]:
    company = await company_service.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    # query = big_query_service.build_transaction_query(company.bq_company_id, company.contract_configurations[-1]) # Add start date and end data
    # calculate billing
    return [MonthlyBilling(period='2023-01', num_transactions=100, total_payment=500.0)]


# COMPANY CRUD ENDPOINTS

# GET /api/companies
@router.get("/api/companies", response_model=list[CompanyDetails])
async def get_companies() -> list[CompanyDetails]:
    companies = await company_service.get_all_companies()
    return companies

# company page
# GET /api/company_conf/{company_id}
@router.get("/api/company_conf/{company_id}", response_model=CompanyConfiguration)
async def get_company_conf(company_id: str):
    company = await company_service.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company configuration not found")
    return company

# edit company
@router.put("/api/company_conf/{company_id}", response_model=CompanyConfiguration)
async def edit_company_conf(company_id: str, company_conf:CompanyConfiguration) -> CompanyConfiguration:
    await company_service.update_company(company_id, company_conf)
    return company_conf

# add company
@router.post("/api/company_conf", response_model=CompanyConfiguration)
async def add_company_conf(company_conf:AddCompanyConfiguration) -> CompanyConfiguration:
    new_id = str(uuid.uuid4())

    new_company = CompanyConfiguration(
        company_id=new_id,
        bq_company_id=company_conf.bq_company_id,
        company_name=company_conf.company_name,
        currency=company_conf.currency,
        contract_configurations=company_conf.contract_configurations
    )

    company_dict = new_company.model_dump(mode="json")
    company_dict["_id"] = new_id

    await company_service.create_company(company_dict)
    return new_company

