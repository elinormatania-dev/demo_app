from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

from models.company_configuration import CompanyConfiguration, AddCompanyConfiguration, CompanyDetails

load_dotenv()

# The URL we defined in your docker-compose.yml
# mongodb://[username]:[password]@[host]:[port]
MONGO_DETAILS = os.getenv("MONGO_DETAILS")

class CompanyService:

    def __init__(self):
        self.client = AsyncIOMotorClient(MONGO_DETAILS)
        database = self.client["billing_db"]

        # Create a 'collection' (like a table) for companies
        company_collection = database.get_collection("companies")
        self.company_collection = company_collection

    async def get_all_companies(self) -> list[CompanyDetails]:
        """
        Fetches all companies from MongoDB.
        """
        cursor = self.company_collection.find({}, {"company_id": 1, "company_name": 1})
        company_dicts = await cursor.to_list(length=1000)

        return [CompanyDetails.model_validate(company_dict) for company_dict in company_dicts]

    async def get_company(self, company_id: str) -> CompanyConfiguration | None:
        """
        Fetches a single company configuration by its ID.
        """
        # find_one returns the dictionary if found, or None if it doesn't exist
        company_data = await self.company_collection.find_one({"company_id": company_id})
        company = CompanyConfiguration.model_validate(company_data)

        return company

    async def create_company(self, company: dict) -> CompanyConfiguration:
        """
        Takes a fully prepared company dictionary and saves it to MongoDB.
        """
        result = await self.company_collection.insert_one(company)
        inserted_company = await self.company_collection.find_one(
            {"_id": result.inserted_id}
        )
        company = CompanyConfiguration.model_validate(inserted_company)

        return company

    async def update_company(self, company_id: str, company: CompanyConfiguration):
        """
        Finds a company by its ID and updates its data in MongoDB.
        """
        await self.company_collection.update_one(
            {"company_id": company_id},
            {"$set": company.model_dump()}
        )