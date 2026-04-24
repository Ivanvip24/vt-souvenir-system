#!/usr/bin/env python3
"""
Notion API Debugging Script
Tests each step of the Notion integration to identify issues
"""

import os
import sys
from dotenv import load_dotenv
from notion_client import Client
import traceback

def print_section(title):
    """Print a section header"""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def test_env_variables():
    """Test 1: Check if .env file exists and has required variables"""
    print_section("TEST 1: Environment Variables")

    load_dotenv()

    api_token = os.getenv('NOTION_API_TOKEN')
    parent_page_id = os.getenv('NOTION_PARENT_PAGE_ID')
    orders_db_id = os.getenv('NOTION_ORDERS_DB_ID')

    print(f"✓ .env file loaded")
    print(f"\nNOTION_API_TOKEN: {'✓ Found' if api_token else '❌ Missing'}")
    if api_token:
        print(f"  Length: {len(api_token)} chars")
        print(f"  Preview: {api_token[:10]}...{api_token[-5:]}")

    print(f"\nNOTION_PARENT_PAGE_ID: {'✓ Found' if parent_page_id else '❌ Missing'}")
    if parent_page_id:
        print(f"  Value: {parent_page_id}")
        print(f"  Length: {len(parent_page_id)} chars")

    print(f"\nNOTION_ORDERS_DB_ID: {'✓ Found' if orders_db_id else '(Optional - not set)'}")
    if orders_db_id:
        print(f"  Value: {orders_db_id}")

    if not api_token or not parent_page_id:
        print("\n❌ FAILED: Missing required environment variables")
        return False

    print("\n✅ PASSED: All required environment variables found")
    return True

def test_api_connection(client):
    """Test 2: Verify API token works"""
    print_section("TEST 2: API Connection")

    try:
        # List users to verify token works
        response = client.users.me()
        print(f"✓ Connected to Notion API")
        print(f"\nBot Info:")
        print(f"  Type: {response.get('type')}")
        print(f"  ID: {response.get('id')}")
        if response.get('name'):
            print(f"  Name: {response.get('name')}")

        print("\n✅ PASSED: API token is valid")
        return True
    except Exception as e:
        print(f"\n❌ FAILED: Could not connect to Notion API")
        print(f"Error: {e}")
        traceback.print_exc()
        return False

def test_parent_page_access(client, parent_page_id):
    """Test 3: Verify parent page exists and is accessible"""
    print_section("TEST 3: Parent Page Access")

    try:
        page = client.pages.retrieve(parent_page_id)
        print(f"✓ Parent page found")
        print(f"\nPage Info:")
        print(f"  ID: {page.get('id')}")

        # Get page title
        properties = page.get('properties', {})
        title_prop = properties.get('title', {})
        if title_prop:
            title_array = title_prop.get('title', [])
            if title_array:
                title = title_array[0].get('text', {}).get('content', 'Untitled')
                print(f"  Title: {title}")

        print(f"  Created: {page.get('created_time')}")
        print(f"  Last edited: {page.get('last_edited_time')}")

        print("\n✅ PASSED: Parent page is accessible")
        return True
    except Exception as e:
        print(f"\n❌ FAILED: Cannot access parent page")
        print(f"Error: {e}")
        print(f"\nPossible issues:")
        print(f"  1. Page ID is incorrect")
        print(f"  2. Integration doesn't have access to this page")
        print(f"  3. Page was deleted")
        print(f"\nTo fix:")
        print(f"  1. Open the page in Notion")
        print(f"  2. Click '...' → 'Connections' → Add your integration")
        traceback.print_exc()
        return False

def test_list_children(client, parent_page_id):
    """Test 4: List children of parent page to find databases"""
    print_section("TEST 4: List Page Children")

    try:
        response = client.blocks.children.list(parent_page_id)
        children = response.get("results", [])

        print(f"✓ Found {len(children)} child blocks")

        databases = []
        for child in children:
            block_type = child.get("type")
            block_id = child.get("id")

            if block_type == "child_database":
                databases.append(child)
                print(f"\n  📊 Database found: {block_id}")

                # Get database details
                try:
                    db = client.databases.retrieve(block_id)
                    db_title = db.get("title", [])
                    if db_title and len(db_title) > 0:
                        title_text = db_title[0].get("text", {}).get("content", "Untitled")
                        print(f"      Title: {title_text}")
                except:
                    pass

        if databases:
            print(f"\n✅ PASSED: Found {len(databases)} database(s) in parent page")
        else:
            print(f"\n⚠️  No databases found (will create new one)")

        return True
    except Exception as e:
        print(f"\n❌ FAILED: Cannot list children of parent page")
        print(f"Error: {e}")
        traceback.print_exc()
        return False

def test_create_page(client, parent_page_id):
    """Test 5: Try to create a test page"""
    print_section("TEST 5: Create Test Page")

    try:
        test_page = client.pages.create(
            parent={
                "type": "page_id",
                "page_id": parent_page_id
            },
            properties={
                "title": {
                    "title": [
                        {
                            "text": {
                                "content": "🧪 API Test - DELETE ME"
                            }
                        }
                    ]
                }
            }
        )

        test_page_id = test_page.get('id')
        print(f"✓ Test page created successfully")
        print(f"  ID: {test_page_id}")

        # Clean up - delete test page
        try:
            client.blocks.delete(test_page_id)
            print(f"✓ Test page deleted (cleanup)")
        except:
            print(f"⚠️  Could not delete test page - please delete manually")
            print(f"  Page ID: {test_page_id}")

        print("\n✅ PASSED: Can create pages in parent")
        return True
    except Exception as e:
        print(f"\n❌ FAILED: Cannot create pages in parent")
        print(f"Error: {e}")
        print(f"\nPossible issues:")
        print(f"  1. Integration doesn't have 'Insert content' permission")
        print(f"  2. Parent page is in a workspace where integration lacks permissions")
        traceback.print_exc()
        return False

def test_create_database(client, parent_page_id):
    """Test 6: Try to create a test database"""
    print_section("TEST 6: Create Test Database")

    try:
        test_db = client.databases.create(
            parent={
                "type": "page_id",
                "page_id": parent_page_id
            },
            title=[
                {
                    "type": "text",
                    "text": {
                        "content": "🧪 Test Database - DELETE ME"
                    }
                }
            ],
            is_inline=True,
            properties={
                "Name": {"title": {}},
                "Status": {
                    "select": {
                        "options": [
                            {"name": "Test", "color": "blue"}
                        ]
                    }
                }
            }
        )

        test_db_id = test_db.get('id')
        print(f"✓ Test database created successfully")
        print(f"  ID: {test_db_id}")

        # Try to create a row in the database
        try:
            test_row = client.pages.create(
                parent={"database_id": test_db_id},
                properties={
                    "Name": {"title": [{"text": {"content": "Test Row"}}]},
                    "Status": {"select": {"name": "Test"}}
                }
            )
            print(f"✓ Test row added to database")
            test_row_id = test_row.get('id')

            # Clean up row
            try:
                client.blocks.delete(test_row_id)
                print(f"✓ Test row deleted")
            except:
                pass
        except Exception as e:
            print(f"⚠️  Could not add row to database: {e}")

        # Clean up - delete test database
        try:
            client.blocks.delete(test_db_id)
            print(f"✓ Test database deleted (cleanup)")
        except:
            print(f"⚠️  Could not delete test database - please delete manually")
            print(f"  Database ID: {test_db_id}")

        print("\n✅ PASSED: Can create databases in parent")
        return True
    except Exception as e:
        print(f"\n❌ FAILED: Cannot create databases in parent")
        print(f"Error: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("\n" + "🔧" * 35)
    print("NOTION API DIAGNOSTIC TOOL")
    print("🔧" * 35)

    # Test 1: Environment variables
    if not test_env_variables():
        print("\n❌ Cannot proceed without valid .env configuration")
        return

    # Load environment
    load_dotenv()
    api_token = os.getenv('NOTION_API_TOKEN')
    parent_page_id = os.getenv('NOTION_PARENT_PAGE_ID')

    # Initialize client
    try:
        client = Client(auth=api_token)
    except Exception as e:
        print(f"\n❌ Failed to initialize Notion client: {e}")
        return

    # Run tests
    results = []
    results.append(("API Connection", test_api_connection(client)))
    results.append(("Parent Page Access", test_parent_page_access(client, parent_page_id)))
    results.append(("List Children", test_list_children(client, parent_page_id)))
    results.append(("Create Page", test_create_page(client, parent_page_id)))
    results.append(("Create Database", test_create_database(client, parent_page_id)))

    # Summary
    print_section("SUMMARY")
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed! Your Notion API is working correctly.")
        print("   If notion_quick.py still fails, the issue is in the script logic.")
    else:
        print("\n⚠️  Some tests failed. Please fix the issues above.")
        print("   Common fixes:")
        print("   1. Verify integration has access to parent page")
        print("   2. Check integration permissions (read/write)")
        print("   3. Ensure API token is correct and not expired")

if __name__ == '__main__':
    main()
