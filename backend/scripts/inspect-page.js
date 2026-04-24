import { Client } from '@notionhq/client';
import { config } from 'dotenv';

config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

async function inspectPage() {
  try {
    const pageId = '2a181b8c-4429-818e-989c-f174fa3e44a7'; // ORD-20251104-7438
    const page = await notion.pages.retrieve({ page_id: pageId });

    console.log('\n=== Notion Page Properties ===\n');

    for (const [key, prop] of Object.entries(page.properties)) {
      console.log(`Property: "${key}"`);
      console.log(`  Type: ${prop.type}`);

      if (prop.type === 'title' && prop.title?.length > 0) {
        console.log(`  Value: ${prop.title[0].plain_text}`);
      } else if (prop.type === 'rich_text' && prop.rich_text?.length > 0) {
        console.log(`  Value: ${prop.rich_text[0].plain_text}`);
      } else if (prop.type === 'select') {
        console.log(`  Value: ${prop.select?.name || '(empty)'}`);
      } else if (prop.type === 'status') {
        console.log(`  Value: ${prop.status?.name || '(empty)'}`);
      } else if (prop.type === 'number') {
        console.log(`  Value: ${prop.number}`);
      } else if (prop.type === 'phone_number') {
        console.log(`  Value: ${prop.phone_number}`);
      } else if (prop.type === 'date') {
        console.log(`  Value: ${prop.date?.start || '(empty)'}`);
      }

      console.log('');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

inspectPage();
