#!/usr/bin/env python3
"""
Test script to verify Notion API connection
"""

import os
from dotenv import load_dotenv
from notion_client import Client

# Load environment variables
load_dotenv()

api_token = os.getenv('NOTION_API_TOKEN')
parent_page_id = os.getenv('NOTION_PARENT_PAGE_ID')

print("=" * 60)
print("Notion API Connection Test")
print("=" * 60)
print()

# Check credentials
if not api_token:
    print("❌ ERROR: NOTION_API_TOKEN not found in .env")
    exit(1)

if not parent_page_id:
    print("❌ ERROR: NOTION_PARENT_PAGE_ID not found in .env")
    exit(1)

print(f"✓ API Token found: {api_token[:20]}...")
print(f"✓ Parent Page ID: {parent_page_id}")
print()

# Try to connect
try:
    print("Connecting to Notion API...")
    client = Client(auth=api_token)

    # Try to retrieve the parent page
    print(f"Retrieving parent page...")
    page = client.pages.retrieve(parent_page_id)

    print("✓ Successfully connected to Notion!")
    print(f"✓ Parent page title: {page.get('properties', {})}")
    print()
    print("=" * 60)
    print("SUCCESS - Notion API connection is working!")
    print("=" * 60)
    print()
    print("You can now run: python notion_quick.py")

except Exception as e:
    print(f"❌ ERROR: {e}")
    print()
    print("Possible issues:")
    print("1. Invalid API token")
    print("2. Invalid parent page ID")
    print("3. Integration doesn't have access to the page")
    print()
    print("To fix:")
    print("1. Verify your .env file has correct credentials")
    print("2. In Notion, open the parent page")
    print("3. Click '...' → 'Add connections'")
    print("4. Select your integration")
    exit(1)
