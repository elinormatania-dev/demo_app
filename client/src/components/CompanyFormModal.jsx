import { useForm, useFieldArray } from 'react-hook-form';
import { useState } from 'react';
import { createCompany, updateCompany, getCompanies } from '../api.js';

const TYPE_OF_ACTION_LABELS = {
  sessionReturnToCustomer: 'Session returned to customer',
  oneComponentWorkedWithoutReturn: 'One component worked without return',
  chargeRegardlessOfReturn: 'Charge regardless of return',
  anyTouchAnyCharge: 'Any touch, any charge',
  comboDependent: 'Combo dependent',
  usingOneServiceOrMore: 'Using one service or more',
  openAccount: 'Open account',
  notDetailedInAgreement: 'Not detailed in agreement',
};

function generateSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function toFormValues(c) {
  return {
    companyname: c?.companyname ?? '',
    bqCompanyId: c?.bqCompanyId ?? '',
    services: (c?.services ?? []).join(', '),
    currency: c?.currency ?? 'ILS',
    annualFixedPayment: c?.annualFixedPayment ?? 0,
    minimumMonthlyActions: c?.minimumMonthlyActions ?? 0,
    SingalActionCost: c?.SingalActionCost ?? 0,
    minMonthlyCost: c?.minMonthlyCost ?? 0,
    levels: (c?.levels ?? []).map(l => ({
      from: l.from,
      to: l.to ?? '',
      actionCost: l.actionCost,
      actionCurrency: l.actionCurrency,
    })),
    billing_rules: {
      pricing_model:        c?.billing_rules?.pricing_model ?? '',
      service_pricing:      Object.entries(c?.billing_rules?.service_pricing ?? {})
        .map(([service_name, price]) => ({ service_name, price })),
      service_name_filters: (c?.billing_rules?.service_name_filters ?? []).join(', '),
      event_name_filter:    c?.billing_rules?.event_name_filter ?? '',
    },
    typeOfAction: Object.keys(c?.typeOfAction ?? {}).find(k => c.typeOfAction[k]) ?? '',
  };
}

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const label = 'block text-xs font-semibold text-gray-600 mb-1';
const sectionTitle = 'text-sm font-bold text-gray-700 mb-3 pb-1 border-b border-gray-100';

/**
 * @param {{ mode: 'create'|'edit', company: object|null, onClose: ()=>void, onSaved: ()=>void }} props
 */
export default function CompanyFormModal({ mode, company, onClose, onSaved }) {
  const [apiError, setApiError] = useState(null);

  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: toFormValues(company),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'levels' });
  const { fields: spFields, append: spAppend, remove: spRemove } =
    useFieldArray({ control, name: 'billing_rules.service_pricing' });

  async function onSubmit(data) {
    setApiError(null);

    const br = data.billing_rules;
    const hasRules = br.pricing_model || br.service_pricing?.length ||
      br.event_name_filter || br.service_name_filters;

    let companyID;
    if (mode === 'create') {
      const existing = await getCompanies();
      const existingIds = new Set(existing.map(c => c.companyID));
      const base = generateSlug(data.companyname);
      companyID = base;
      let i = 1;
      while (existingIds.has(companyID)) {
        companyID = `${base}_${String(i).padStart(3, '0')}`;
        i++;
      }
    }

    const payload = {
      ...(mode === 'create' && { companyID }),
      ...data,
      services: data.services.split(',').map(s => s.trim()).filter(Boolean),
      levels: data.levels.map((l, i) => ({
        level: i + 1,
        from: Number(l.from),
        to: l.to === '' || l.to == null ? null : Number(l.to),
        actionCost: Number(l.actionCost),
        actionCurrency: l.actionCurrency,
      })),
      ...(hasRules ? {
        billing_rules: {
          ...(br.pricing_model && { pricing_model: br.pricing_model }),
          ...(br.service_pricing?.length && {
            service_pricing: Object.fromEntries(
              br.service_pricing
                .filter(row => row.service_name?.trim())
                .map(row => [row.service_name.trim(), Number(row.price)])
            ),
          }),
          ...(br.event_name_filter && { event_name_filter: br.event_name_filter }),
          ...(br.service_name_filters && {
            service_name_filters: br.service_name_filters.split(',').map(s => s.trim()).filter(Boolean),
          }),
        },
      } : {}),
    };
    if (!payload.billing_rules) delete payload.billing_rules;
    if (!payload.bqCompanyId) delete payload.bqCompanyId;
    payload.typeOfAction = Object.fromEntries(
      Object.keys(TYPE_OF_ACTION_LABELS).map(k => [k, k === data.typeOfAction])
    );

    try {
      if (mode === 'create') {
        await createCompany(payload);
      } else {
        await updateCompany(company.companyID, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setApiError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {mode === 'create' ? 'Add Company' : 'Edit Company'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-6">

          {/* A — Basic Info */}
          <section>
            <h3 className={sectionTitle}>Basic Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Company Name *</label>
                <input {...register('companyname', { required: 'Required' })} className={input} />
                {errors.companyname && <p className="text-xs text-red-500 mt-1">{errors.companyname.message}</p>}
              </div>
              <div>
                <label className={label}>Services (comma-separated)</label>
                <input {...register('services')} placeholder="OCR, LIVENESS" className={input} />
              </div>
              <div>
                <label className={label}>Currency</label>
                <select {...register('currency')} className={input}>
                  <option value="ILS">ILS (₪)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
            </div>
          </section>

          {/* B — Pricing */}
          <section>
            <h3 className={sectionTitle}>Pricing</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>Annual Fixed Payment</label>
                <input type="number" {...register('annualFixedPayment', { valueAsNumber: true })} className={input} />
              </div>
              <div>
                <label className={label}>Min Monthly Actions</label>
                <input type="number" {...register('minimumMonthlyActions', { valueAsNumber: true })} className={input} />
              </div>
              <div>
                <label className={label}>Min Monthly Cost</label>
                <input type="number" step="0.01" {...register('minMonthlyCost', { valueAsNumber: true })} className={input} />
              </div>
            </div>
          </section>

          {/* C — Pricing Tiers */}
          <section>
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">Pricing Tiers</h3>
              {fields.length < 7 && (
                <button
                  type="button"
                  onClick={() => append({ from: 0, to: '', actionCost: 0, actionCurrency: 'ILS' })}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add Tier
                </button>
              )}
            </div>
            {fields.length === 0 && (
              <p className="text-xs text-gray-400">No tiers — flat rate applied.</p>
            )}
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-5 gap-2 mb-2 items-end">
                <div>
                  <label className={label}>From</label>
                  <input type="number" {...register(`levels.${i}.from`, { valueAsNumber: true })} className={input} />
                </div>
                <div>
                  <label className={label}>To (blank=∞)</label>
                  <input type="number" {...register(`levels.${i}.to`)} placeholder="∞" className={input} />
                </div>
                <div>
                  <label className={label}>Cost/Action</label>
                  <input type="number" step="0.01" {...register(`levels.${i}.actionCost`, { valueAsNumber: true })} className={input} />
                </div>
                <div>
                  <label className={label}>Currency</label>
                  <select {...register(`levels.${i}.actionCurrency`)} className={input}>
                    <option value="ILS">ILS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-red-400 hover:text-red-600 pb-2 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            ))}
          </section>

          {/* D — BigQuery / Billing Rules */}
          <section>
            <h3 className={sectionTitle}>
              BigQuery / Billing Rules <span className="font-normal text-gray-400 text-xs">(optional)</span>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label}>BQ Company ID</label>
                <input {...register('bqCompanyId')} className={input} placeholder="67e24df6ec44cf1de85aabe8" />
              </div>
              <div>
                <label className={label}>Pricing Model</label>
                <select {...register('billing_rules.pricing_model')} className={input}>
                  <option value="">— none —</option>
                  <option value="flat">Fixed Price per Action</option>
                  <option value="tiered_volume">Volume Discount (Applied to all units)</option>
                  <option value="tiered_marginal">Progressive Tiers</option>
                </select>
              </div>

              {/* Service Pricing */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className={label}>Service Pricing</label>
                  <button
                    type="button"
                    onClick={() => spAppend({ service_name: '', price: 0 })}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + Add Service
                  </button>
                </div>
                {spFields.length === 0 && (
                  <p className="text-xs text-gray-400">No service pricing — uses base action cost or tiered pricing.</p>
                )}
                {spFields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-[2fr_1fr_auto] gap-2 mb-2 items-end">
                    <div>
                      <label className={label}>Service Name</label>
                      <input
                        {...register(`billing_rules.service_pricing.${i}.service_name`, { required: 'Required' })}
                        placeholder="ocr"
                        className={input}
                      />
                    </div>
                    <div>
                      <label className={label}>Price</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        {...register(`billing_rules.service_pricing.${i}.price`, { valueAsNumber: true })}
                        className={input}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => spRemove(i)}
                      className="text-red-400 hover:text-red-600 pb-2 text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className={label}>Base Action Cost <span className="text-gray-400 font-normal">(flat / tiered billing)</span></label>
                <input type="number" step="0.01" {...register('SingalActionCost', { valueAsNumber: true })} className={input} />
              </div>
            </div>
          </section>

          {/* E — Action Type */}
          <section>
            <h3 className={sectionTitle}>Action Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_OF_ACTION_LABELS).map(([key, lbl]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" {...register('typeOfAction')} value={key} />
                  {lbl}
                </label>
              ))}
            </div>
          </section>

          {/* API error */}
          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {apiError}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Add Company' : 'Save Changes'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
