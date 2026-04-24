#!/usr/bin/env python3
"""
Helper script to find the parent page of a database
"""

import os
from dotenv import load_dotenv
from notion_client import Client

load_dotenv()

api_token = os.getenv('NOTION_API_TOKEN')
database_id = "12581b8c442981138ad5d23b3ccad3df"

client = Client(auth=api_token)

print("=" * 70)
print("FINDING PARENT PAGE")
print("=" * 70)

try:
    # Retrieve the database to get its parent
    db = client.databases.retrieve(database_id)

    print(f"\n✓ Database found: {database_id}")

    # Get database title
    db_title = db.get("title", [])
    if db_title and len(db_title) > 0:
        title_text = db_title[0].get("text", {}).get("content", "Untitled")
        print(f"  Title: {title_text}")

    # Get parent info
    parent = db.get("parent", {})
    parent_type = parent.get("type")

    print(f"\nParent type: {parent_type}")

    if parent_type == "page_id":
        parent_page_id = parent.get("page_id")
        print(f"✅ Found parent page ID: {parent_page_id}")
        print(f"\nUpdate your .env file with:")
        print(f"NOTION_PARENT_PAGE_ID={parent_page_id}")

        # Try to access parent page
        try:
            parent_page = client.pages.retrieve(parent_page_id)
            print(f"\n✓ Parent page is accessible!")

            # Get page title
            properties = parent_page.get('properties', {})
            title_prop = properties.get('title', {})
            if title_prop:
                title_array = title_prop.get('title', [])
                if title_array:
                    page_title = title_array[0].get('text', {}).get('content', 'Untitled')
                    print(f"  Title: {page_title}")

        except Exception as e:
            print(f"\n⚠️ Cannot access parent page: {e}")
            print(f"\nYou need to:")
            print(f"1. Open this page in Notion: https://notion.so/{parent_page_id.replace('-', '')}")
            print(f"2. Click '...' → 'Connections' → Add 'VT Orders API'")

    elif parent_type == "workspace":
        print(f"❌ This database is at workspace level (no parent page)")
        print(f"\nSOLUTION: You need to create a new page OR move this database into a page")
        print(f"\nQuick fix:")
        print(f"1. Create a new blank page in Notion")
        print(f"2. Share it with 'VT Orders API' integration")
        print(f"3. Copy the page URL and extract the ID")
        print(f"4. Update NOTION_PARENT_PAGE_ID in .env")

    else:
        print(f"❌ Unknown parent type: {parent_type}")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
