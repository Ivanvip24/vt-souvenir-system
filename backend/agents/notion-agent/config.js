import { config } from 'dotenv';

config();

export const notionConfig = {
  auth: process.env.NOTION_API_TOKEN,
  ordersDatabase: process.env.NOTION_ORDERS_DATABASE_ID,
};

// Property name mappings - MATCHED TO YOUR "Projects VT" DATABASE
export const propertyMappings = {
  // Order identification - using DESTINO as title (order number + client name)
  title: 'DESTINO',

  // Client information
  clientName: 'Nombre Cliente',
  clientPhone: 'Phone ',  // Note: has a space after "Phone"

  // Financial
  totalPrice: 'Total Price',
  firstDeposit: '1st Deposit',
  secondDeposit: '2nd Deposit',

  // Workflow
  status: 'Status',

  // Date - using the empty date property
  eventDate: '',  // Empty name for the date field

  // Notes and summary
  summary: 'Summary',

  // Additional fields in your database (not used but available)
  startDay: 'Dia de Inicio',
  idCerebro: 'ID CEREBRO',
  idOrganization: 'ID ORGANIZACIÓN>>CEREBRO',
  idDesign: 'ID DISEÑO>>CEREBRO',
  person: 'Person',
  createdBy: 'Created by',
};

// Status options - MATCHED TO YOUR DATABASE
export const statusOptions = [
  'Diseño',
  'Producción & Embalaje',
  'En ruta / Por recoger',
  'Entregado/Recogido',
  'Cancelado'
];

// Map internal status values to your Notion status options
export function mapStatusToNotion(status) {
  if (!status) return 'Diseño'; // Default

  const statusMap = {
    'new': 'Diseño',
    'pending': 'Diseño',
    'design': 'Diseño',
    'production': 'Producción & Embalaje',
    'printing': 'Producción & Embalaje',
    'cutting': 'Producción & Embalaje',
    'counting': 'Producción & Embalaje',
    'shipping': 'En ruta / Por recoger',
    'in_transit': 'En ruta / Por recoger',
    'delivered': 'Entregado/Recogido',
    'cancelled': 'Cancelado'
  };

  return statusMap[status.toLowerCase()] || 'Diseño';
}

// Department options
export const departmentOptions = [
  'Design',
  'Production',
  'Counting',
  'Shipping',
  'Completed'
];

// Priority options
export const priorityOptions = [
  'Low',
  'Normal',
  'High',
  'Urgent'
];

// Validate configuration
export function validateConfig() {
  if (!notionConfig.auth) {
    throw new Error('NOTION_API_TOKEN is not set in environment variables');
  }

  if (!notionConfig.ordersDatabase) {
    throw new Error('NOTION_ORDERS_DATABASE_ID is not set in environment variables');
  }

  return true;
}

export default {
  notionConfig,
  propertyMappings,
  statusOptions,
  departmentOptions,
  priorityOptions,
  validateConfig
};
