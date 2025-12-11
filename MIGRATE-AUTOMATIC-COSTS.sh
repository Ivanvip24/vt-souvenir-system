#!/bin/bash

# =====================================================
# Automatic Cost Calculations Migration Script
# =====================================================
# This script applies the automatic cost calculation system
# to your PostgreSQL database on Render
# =====================================================

echo "🚀 Starting Automatic Cost Calculations Migration"
echo ""

# Database URL - update this with your Render database URL
DATABASE_URL="postgresql://souvenir_management_user:PSN6MKlWzsKH7ePzBOcnEC4g5aSK74OB@dpg-d45eb9n5r7bs73ag5ou0-a.oregon-postgres.render.com/souvenir_management"

# Migration file path
MIGRATION_FILE="backend/shared/migrations/010-automatic-cost-calculations.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Error: Migration file not found at $MIGRATION_FILE"
    exit 1
fi

echo "📄 Found migration file: $MIGRATION_FILE"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found"
    echo ""
    echo "Options:"
    echo "1. Install PostgreSQL client:"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql-client"
    echo ""
    echo "2. Or use Render's web SQL console:"
    echo "   - Go to your database dashboard on Render"
    echo "   - Click 'SQL' tab"
    echo "   - Copy-paste the contents of: $MIGRATION_FILE"
    exit 1
fi

echo "✅ psql found"
echo ""

# Prompt for confirmation
echo "This will apply the migration to your database:"
echo "Database: $DATABASE_URL"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Migration cancelled"
    exit 0
fi

echo ""
echo "⚙️  Applying migration..."
echo ""

# Run the migration
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "🔄 Created Functions:"
    echo "   - calculate_product_cost_from_bom()"
    echo "   - update_product_costs()"
    echo ""
    echo "⚡ Created Triggers:"
    echo "   - Auto-update when components change"
    echo "   - Auto-update when material prices change"
    echo "   - Auto-update when labor costs change"
    echo ""
    echo "📊 Created Views:"
    echo "   - cost_analysis"
    echo "   - product_bom_costs"
    echo ""
    echo "🎉 Your automatic cost calculation system is now active!"
    echo ""
    echo "Next steps:"
    echo "1. Add BOM components to your products in the admin UI"
    echo "2. Costs will calculate automatically"
    echo "3. Check Prices & Margins dashboard to see results"
    echo ""
else
    echo ""
    echo "❌ Migration failed!"
    echo ""
    echo "Possible solutions:"
    echo "1. Check database connection"
    echo "2. Verify you have the correct permissions"
    echo "3. Check if migration was already applied"
    echo ""
    echo "You can also apply the migration manually using Render's SQL console:"
    echo "1. Go to: https://dashboard.render.com"
    echo "2. Open your database"
    echo "3. Click 'SQL' tab"
    echo "4. Copy-paste contents from: $MIGRATION_FILE"
    exit 1
fi
