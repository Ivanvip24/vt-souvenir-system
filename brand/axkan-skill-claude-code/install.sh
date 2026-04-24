#!/bin/bash

# ============================================================
# AXKAN Skill Installer for Claude Code
# ============================================================
# Este script instala el skill de AXKAN para Claude Code
# Uso: ./install.sh [--global | --project]
# ============================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Arte ASCII de AXKAN
echo -e "${YELLOW}"
echo "    _   __  __ _   __    _    _   _ "
echo "   / \  \ \/ /| | / /   / \  | \ | |"
echo "  / _ \  \  / | |/ /   / _ \ |  \| |"
echo " / ___ \ /  \ |   <   / ___ \| |\  |"
echo "/_/   \_/_/\_\|_|\_\ /_/   \_\_| \_|"
echo ""
echo -e "${NC}Detonadores de Orgullo Mexicano"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Obtener el directorio del script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_FILE="$SCRIPT_DIR/SKILL.md"

# Verificar que existe el archivo SKILL.md
if [ ! -f "$SKILL_FILE" ]; then
    echo -e "${RED}Error: No se encontró SKILL.md en el directorio actual${NC}"
    echo "Asegúrate de ejecutar este script desde el directorio del paquete"
    exit 1
fi

# Función para instalar globalmente
install_global() {
    echo -e "${BLUE}📦 Instalando skill globalmente...${NC}"
    
    GLOBAL_DIR="$HOME/.claude/skills/axkan"
    
    # Crear directorio si no existe
    mkdir -p "$GLOBAL_DIR"
    
    # Copiar archivo
    cp "$SKILL_FILE" "$GLOBAL_DIR/"
    
    echo -e "${GREEN}✅ Skill instalado globalmente en:${NC}"
    echo "   $GLOBAL_DIR/SKILL.md"
    echo ""
    echo -e "${YELLOW}El skill estará disponible en todas las sesiones de Claude Code${NC}"
}

# Función para instalar en proyecto
install_project() {
    echo -e "${BLUE}📦 Instalando skill en proyecto actual...${NC}"
    
    PROJECT_DIR=".claude/skills/axkan"
    
    # Crear directorio si no existe
    mkdir -p "$PROJECT_DIR"
    
    # Copiar archivo
    cp "$SKILL_FILE" "$PROJECT_DIR/"
    
    echo -e "${GREEN}✅ Skill instalado en proyecto:${NC}"
    echo "   $(pwd)/$PROJECT_DIR/SKILL.md"
    echo ""
    echo -e "${YELLOW}El skill estará disponible solo en este proyecto${NC}"
}

# Procesar argumentos
case "$1" in
    --global|-g)
        install_global
        ;;
    --project|-p)
        install_project
        ;;
    *)
        echo "¿Dónde quieres instalar el skill de AXKAN?"
        echo ""
        echo "  1) Global (~/.claude/skills/) - Disponible en todos los proyectos"
        echo "  2) Proyecto actual (.claude/skills/) - Solo este proyecto"
        echo ""
        read -p "Selecciona una opción [1/2]: " choice
        
        case "$choice" in
            1)
                install_global
                ;;
            2)
                install_project
                ;;
            *)
                echo -e "${RED}Opción inválida${NC}"
                exit 1
                ;;
        esac
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 ¡Instalación completada!${NC}"
echo ""
echo "Ahora puedes usar el skill en Claude Code:"
echo "  - \"¿Cuáles son los colores de AXKAN?\""
echo "  - \"Escribe un post con voz de AXKAN\""
echo "  - \"Aplica el AXKAN Test a esta idea\""
echo ""
echo -e "${YELLOW}¡Éxito con tu marca! 🇲🇽${NC}"
