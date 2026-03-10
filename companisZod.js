import { z } from 'zod';

const LevelSchema = z.object({
  level: z.number().int(),           
  from: z.number().int(),            
  to: z.number().int().nullable(),   
  actionCost: z.number(),            
  actionCurrency: z.enum(["ILS", "USD", "EUR"])
});

export const BillingConfigSchema = z.object({
  companyname: z.string(),
  companyID: z.string(),
  bqCompanyId: z.string().optional(),
  services: z.array(z.string()),

  annualFixedPayment: z.number().int(),
  minimumMonthlyActions: z.number().int(),
  SingalActionCost: z.number(),
  currency: z.enum(["ILS", "USD", "EUR"]),
  minMonthlyCost: z.number(),

  levels: z.array(LevelSchema).max(7),

  billing_rules: z.object({
    pricing_model: z.enum(['flat', 'tiered_volume', 'tiered_marginal']).optional(),
    action_expression: z.string().optional(),
    additional_filters: z.string().optional(),
    event_name_filter: z.string().optional(),
    service_name_filters: z.array(z.string()).optional(),
  }).optional(),

  typeOfAction: z.object({
    sessionReturnToCustomer: z.boolean().default(false),                
    oneComponentWorkedWithoutReturn: z.boolean().default(false),       
    chargeRegardlessOfReturn: z.boolean().default(false),              
    anyTouchAnyCharge: z.boolean().default(false),                     
    comboDependent: z.boolean().default(false),                        
    usingOneServiceOrMore: z.boolean().default(false),                
    openAccount: z.boolean().default(false),                           
    notDetailedInAgreement: z.boolean().default(false)                 
  })
});

// BillingConfig type: z.infer<typeof BillingConfigSchema>