# Script Setup Instructions

## How to Create the Required Action

The script needs an action to adjust rasterized images to full black. Follow these steps to create it:

### Step 1: Create a Test Object
1. Create any vector object in Illustrator
2. Select it and rasterize it (Object > Rasterize)

### Step 2: Open Actions Panel
1. Go to **Window > Actions** (or press Alt+F9)
2. Click the folder icon to create a new action set
3. Name it: **ColorAdjustments**

### Step 3: Record the Action
1. Select your rasterized object
2. In the Actions panel, click the "Create New Action" button (page icon)
3. Name it: **AdjustToBlack**
4. Make sure it's in the **ColorAdjustments** set
5. Click **Record**

### Step 4: Perform the Color Adjustment
1. With the object still selected, go to **Edit > Edit Colors > Adjust Colors**
2. In the dialog that appears:
   - Set **Cyan** to: 0%
   - Set **Magenta** to: 0%
   - Set **Yellow** to: 0%
   - Set **Black (Negro)** to: **100%**
3. Click **OK**

### Step 5: Stop Recording
1. In the Actions panel, click the **Stop** button (square icon)

### Step 6: Test the Action
1. Create another rasterized object
2. Select it
3. In the Actions panel, select the **AdjustToBlack** action
4. Click the **Play** button (triangle icon)
5. The object should turn completely black

## Using the Script

Once the action is set up:
1. Select any vector object in Illustrator
2. Run the script: **File > Scripts > Other Script...**
3. Select `copy_rasterize_move.jsx`

The script will automatically:
- Create a rasterized copy 100mm to the right
- Create a second copy 200mm to the right (full black)

## Troubleshooting

**If the action doesn't work:**
- Make sure the action set is named exactly: `ColorAdjustments`
- Make sure the action is named exactly: `AdjustToBlack`
- If the action doesn't exist, the script will open the Adjust Colors dialog manually (you'll need to set Black to 100% and click OK)

**Alternative:** You can modify line 54 in the script to use a different action name or set if you prefer.
