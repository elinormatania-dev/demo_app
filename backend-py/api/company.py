import uuid
from models.company_configuration import (
    CompanyConfiguration,
    AddCompanyConfiguration,
    CompanyDetails,
)
from services.company import CompanyService
from fastapi import APIRouter, HTTPException


router = APIRouter(prefix="/api/companies")
company_service = CompanyService()

# GET /api/companies
@router.get("/", response_model=list[CompanyDetails])
async def get_companies() -> list[CompanyDetails]:
    companies = await company_service.get_all_companies()
    return companies

# company page
# GET /api/companies/{company_id}
@router.get("/{company_id}", response_model=CompanyConfiguration)
async def get_company_conf(company_id: str):
    company = await company_service.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company configuration not found")
    return company

# edit company
@router.put("/{company_id}", response_model=CompanyConfiguration)
async def edit_company_conf(company_id: str, company_conf:CompanyConfiguration) -> CompanyConfiguration:
    await company_service.update_company(company_id, company_conf)
    return company_conf

# add company
@router.post("/", response_model=CompanyConfiguration)
async def add_company_conf(company_conf:AddCompanyConfiguration) -> CompanyConfiguration:
    new_id = str(uuid.uuid4())

    new_company = CompanyConfiguration(
        company_id=company_conf.company_id,
        company_name=company_conf.company_name,
        currency=company_conf.currency,
        contract_configurations=company_conf.contract_configurations
    )

    company_dict = new_company.model_dump(mode="json")
    company_dict["_id"] = new_id

    print('company_dict', company_dict)

    await company_service.create_company(company_dict)
    return new_company