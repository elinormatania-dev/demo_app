import { useForm, useFieldArray } from 'react-hook-form';
import { useState } from 'react';
import { createCompany, updateCompany } from '../api.js';

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

function toFormValues(c) {
  return {
    companyname: c?.companyname ?? '',
    companyID: c?.companyID ?? '',
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
      pricing_model: c?.billing_rules?.pricing_model ?? '',
      action_expression: c?.billing_rules?.action_expression ?? '',
      additional_filters: c?.billing_rules?.additional_filters ?? '',
      event_name_filter: c?.billing_rules?.event_name_filter ?? '',
      service_name_filters: (c?.billing_rules?.service_name_filters ?? []).join(', '),
    },
    typeOfAction: {
      sessionReturnToCustomer: c?.typeOfAction?.sessionReturnToCustomer ?? false,
      oneComponentWorkedWithoutReturn: c?.typeOfAction?.oneComponentWorkedWithoutReturn ?? false,
      chargeRegardlessOfReturn: c?.typeOfAction?.chargeRegardlessOfReturn ?? false,
      anyTouchAnyCharge: c?.typeOfAction?.anyTouchAnyCharge ?? false,
      comboDependent: c?.typeOfAction?.comboDependent ?? false,
      usingOneServiceOrMore: c?.typeOfAction?.usingOneServiceOrMore ?? false,
      openAccount: c?.typeOfAction?.openAccount ?? false,
      notDetailedInAgreement: c?.typeOfAction?.notDetailedInAgreement ?? false,
    },
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

  async function onSubmit(data) {
    setApiError(null);

    const br = data.billing_rules;
    const hasRules = br.pricing_model || br.action_expression || br.additional_filters ||
      br.event_name_filter || br.service_name_filters;

    const payload = {
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
          ...(br.action_expression && { action_expression: br.action_expression }),
          ...(br.additional_filters && { additional_filters: br.additional_filters }),
          ...(br.event_name_filter && { event_name_filter: br.event_name_filter }),
          ...(br.service_name_filters && {
            service_name_filters: br.service_name_filters.split(',').map(s => s.trim()).filter(Boolean),
          }),
        },
      } : {}),
    };
    if (!payload.billing_rules) delete payload.billing_rules;
    if (!payload.bqCompanyId) delete payload.bqCompanyId;

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
                <label className={label}>Company ID *</label>
                <input
                  {...register('companyID', { required: 'Required' })}
                  readOnly={mode === 'edit'}
                  className={input + (mode === 'edit' ? ' bg-gray-50 text-gray-400 cursor-not-allowed' : '')}
                />
                {errors.companyID && <p className="text-xs text-red-500 mt-1">{errors.companyID.message}</p>}
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
                <label className={label}>Single Action Cost</label>
                <input type="number" step="0.01" {...register('SingalActionCost', { valueAsNumber: true })} className={input} />
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
                  <option value="flat">flat</option>
                  <option value="tiered_volume">tiered_volume</option>
                  <option value="tiered_marginal">tiered_marginal</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={label}>Action Expression (SQL)</label>
                <textarea
                  {...register('billing_rules.action_expression')}
                  rows={2}
                  className={input + ' resize-none font-mono text-xs'}
                  placeholder="COUNT(DISTINCT CASE WHEN event_name = 'send_create_session_request' THEN session_id END)"
                />
              </div>
              <div>
                <label className={label}>Additional Filters (SQL)</label>
                <input {...register('billing_rules.additional_filters')} className={input} placeholder="AND status = 'SUCCESS'" />
              </div>
              <div>
                <label className={label}>Event Name Filter</label>
                <input {...register('billing_rules.event_name_filter')} className={input} placeholder="send_create_session_request" />
              </div>
              <div className="col-span-2">
                <label className={label}>Service Name Filters (comma-separated)</label>
                <input {...register('billing_rules.service_name_filters')} className={input} placeholder="ocr, liveness" />
              </div>
            </div>
          </section>

          {/* E — Action Type */}
          <section>
            <h3 className={sectionTitle}>Action Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_OF_ACTION_LABELS).map(([key, lbl]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" {...register(`typeOfAction.${key}`)} className="rounded" />
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
