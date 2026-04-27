#!/bin/bash
# Direct test without Automator

TEST_PDF='/Volumes/TRABAJOS/2025/ARMADOS VT/IMANES/HUAUTLA DE JIMENEZ/ARM - HUAUTLA SABINA MARCO HONGOS REDONDOS CURSIVA SCRIPT.pdf'

echo "Testing with: $TEST_PDF"
/Users/ivanvalenciaperez/Desktop/CLAUDE/BETA_PHASE/axkan-brain-v2/tools/spelling-checker/auto_verify.sh "$TEST_PDF"
