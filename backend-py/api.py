from typing import Optional
from enum import Enum
from pydantic import BaseModel
from company_configuration import CompanyConfiguration, AddCompanyConfiguration

class PeriodBasedFilter(Enum):
    MONTH = "MONTH"
    QUARTER = "QUARTER"
    YEAR = "YEAR"

class ServiceName(Enum):
    OCR = "OCR"
    LIVENESS = "LIVENESS"
    STT = "STT"


class MonthlyBilling(BaseModel):
    period: str
    num_transactions: int
    total_payment: float

class CompanyDetails(BaseModel): 
    id: str
    name: str


## main page 
# GET /api/companies
def get_companies() -> list[CompanyDetails]:
    pass


# GET /api/payment_table
def get_payment_table(company_id: str, time_filter: PeriodBasedFilter, service_name: Optional[ServiceName]= None) -> list[MonthlyBilling]:
    pass    


# company page
# GET /api/company_conf
def get_company_conf(company_id: str) -> CompanyConfiguration:
    pass

# add company
# POST /api/company_conf
def add_company_conf(company_conf:AddCompanyConfiguration) -> CompanyConfiguration:
    pass

# edit company
# PUT /api/company_conf
def edit_company_conf(company_conf:CompanyConfiguration):
    pass

