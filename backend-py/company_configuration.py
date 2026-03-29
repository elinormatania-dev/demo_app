from pydantic import BaseModel, model_validator
from datetime import date 
from enum import Enum
from typing import Optional, Literal, Union, List

# --- ENUMS ---
class Currency(str , Enum):
    ILS = "ILS"
    USD = "USD"

class ServiceName(str,Enum):
    OCR = "ocr"
    LIVENESS = "liveness"
    STT = "video_statement"
    FACE = "face_match"
    MOBILE_FORM = "mobile_form"

class BillingModel(str, Enum):
    # volume_tiered_with_minimum - The client gets a discount as the number of actions rises, but there is a minimum fee floor they must pay.
    VOLUME_TIERED_WITH_MINIMUM = "volume_tiered" 
    
    # itemized_usage_with_minimum - each service(ocr , liveness) has its own distinct price but they share a combined minimum floor (e.g. OCR is 1.20, Liveness is 0.80, minimum is 5000 combined).
    ITEMIZED_USAGE_WITH_MINIMUM = "itemized_usage"
    
    # prepaid_with_overage - The customer pays upfront for a set amount of usage (a wallet). Usage draws down the wallet; overage is charged at a specific rate.
    PREPAID_WITH_OVERAGE = "prepaid_with_overage"

    SUM_MINUS_MINIMUM = "sum_minus_minimum"

# --- BILLING LOGIC & MATH ---

class Tier(BaseModel):
    from_num_actions: float 
    up_to_num_actions: Union[float, Literal["unlimited"]] # 3500
    price_per_unit: float
 

class PaymentRules(BaseModel):
    overage_price_per_unit: Optional[float] = None # for prepaid - the penalty or extra fee a customer pays when they exceed their prepaid limit.
    tiers: List[Tier]
    event_name: Event
    flow_id: Optional[List[str]] = None # 11 #10,8
    # service_name: Optional[ServiceName] = None

    
    # tiers: Optional[List[Tier]] = None
    # price_per_unit: Optional[float] = None # usage_with_minimum_spend - A strict flat rate per transaction, but with a guaranteed minimum floor.

    # @model_validator(mode="after")
    # def at_least_one_not_none(self):
    #     if not any([self.price_per_unit, self.tiers]):
    #         raise ValueError("Either price_per_unit or tiers must be provided")
    #     return self

       #    @model_validator(mode="after")
    # def at_least_one_not_none(self):
    #     if not any([self.event_name, self.service_name]):
    #         raise ValueError("Either event_name or service_name must be provided")
    #     return self



# --- BIGQUERY MAPPING --- 

class Event(Enum):
    ocr_started = 'ocr_started' 
    ocr_ended = 'ocr_ended'
    liveness_started = 'liveness_started' 
    liveness_ended = 'liveness_ended'
    stt_started = 'stt_started'
    stt_ended = 'stt_ended'
    bio_ended = 'bio_ended'

EVENT_TO_EVENT_NAMES = {
    Event.ocr_started: ['send_create_session_request'],
    Event.ocr_ended: ['client_session_data_request'],
    Event.liveness_started: ['liveness_session_init_request', 'check_liveness_request'],
    Event.liveness_ended: ['liveness_complete_result_response'],
    Event.stt_started: ['stt_recording_started'],
    Event.stt_ended: ['stt_upload_video_end' ,'stt_next_process_started'],
    Event.bio_ended: ['face_match_responded_for_images']
}   
   
class CompanyContractConfiguration(BaseModel):
    contract_start_date: date
    contract_end_date: date
    billing_model: BillingModel # VOLUME_TIERED_WITH_MINIMUM
    minimum_monthly_actions: Optional[int] = None
    minimum_monthly_fee: Optional[float] = None # 2250
    fixed_yearly_fee: float #195k
    payment_rules: List[PaymentRules]

class CompanyConfiguration(BaseModel):
    company_id: str 
    bq_company_id: str 
    company_name: str
    currency: Currency
    contract_configurations: List[CompanyContractConfiguration]

class AddCompanyConfiguration(BaseModel):
    bq_company_id: str
    company_name: str
    currency: Currency
    contract_configurations: List[CompanyContractConfiguration]