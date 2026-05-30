import asyncio
import json

from services.company import CompanyService

async def main():
    companies_configurations = json.load(open("companies.json", "r"))
    service = CompanyService()
    for company in companies_configurations:
        await service.create_company(company)

if __name__ == "__main__":
    asyncio.run(main())