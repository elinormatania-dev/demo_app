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

    // Structured billing definition — replaces the manual SQL fields
    weighted_actions: z.array(z.object({
      event_name:   z.string().min(1),
      weight:       z.number().positive(),
      display_name: z.string().optional(),
    })).optional(),

    // Per-service cost map — stored for future pricing use
    service_pricing: z.record(z.string(), z.number()).optional(),

    // Still active — used by the service_name_filters billing path
    event_name_filter:    z.string().optional(),
    service_name_filters: z.array(z.string()).optional(),

    // Deprecated — kept optional for backward compat while data is migrated
    action_expression:  z.string().optional(),
    additional_filters: z.string().optional(),
    weighted_events:    z.record(z.string(), z.number()).optional(),
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