import { generateBrandedReceipt } from '../backend/services/branded-receipt-generator.js';

const result = await generateBrandedReceipt({
  clientName: 'Iván',
  projectName: 'AXKAN',
  projectDescription: 'Producción de 1 Productos AXKAN - con diseño personalizado AXKAN',
  items: [
    { product: 'Productos AXKAN', size: '-', quantity: 1, unitPrice: 2000 }
  ],
  advanceAmount: 500,
  paymentMethod: 'Transferencia Bancaria',
  paymentDate: new Date(),
  receiptType: 'advance'
});

console.log(`\n📄 Receipt saved to: ${result.filepath}`);
console.log(`   Receipt #: ${result.receiptNumber}`);
console.log(`   Total: $${result.totalProject}`);
console.log(`   Advance: $${result.advanceAmount}`);
console.log(`   Remaining: $${result.remainingBalance}`);
