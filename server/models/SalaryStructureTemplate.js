import mongoose from 'mongoose';
import tenantScope from './plugins/tenantScope.js';

const FormulaFieldSchema = new mongoose.Schema({
  key: { type: String, required: true, lowercase: true, trim: true },
  label: { type: String, required: true, trim: true },
  // 'balance_of_ctc' extends the original spec to model "Remaining Fixed"
  // earnings (e.g. Special Allowance) shown in the wireframe — it absorbs
  // whatever monthly CTC is left after the other earnings are computed.
  calculationType: { type: String, enum: ['fixed', 'percentage_of_ctc', 'percentage_of_basic', 'balance_of_ctc'], required: true },
  // Semantics by type (all monetary values are stored in paisa, integer):
  //   fixed               -> valueFactor is a fixed MONTHLY amount in paisa
  //   percentage_of_ctc   -> valueFactor is a percent (e.g. 45) of monthly CTC
  //   percentage_of_basic -> valueFactor is a percent of the computed basic
  //   balance_of_ctc      -> valueFactor ignored; remainder of monthly CTC
  valueFactor: { type: Number, required: true, default: 0 }
}, { _id: false });

const SalaryStructureTemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  earningsStructure: [FormulaFieldSchema],
  deductionsStructure: [FormulaFieldSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Template name is unique within a company (Epic T).
SalaryStructureTemplateSchema.index({ companyId: 1, name: 1 }, { unique: true });

SalaryStructureTemplateSchema.plugin(tenantScope);

export default mongoose.model('SalaryStructureTemplate', SalaryStructureTemplateSchema);
