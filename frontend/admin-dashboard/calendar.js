/**
 * Production Calendar with Capacity Management
 * Shows orders by production deadline with daily capacity tracking
 */

// Calendar Configuration
const CALENDAR_CONFIG = {
  dailyCapacity: 2500, // Maximum pieces per day
  workDays: [1, 2, 3, 4, 5], // Monday to Friday (0 = Sunday)
};

// Calendar State
let calendarState = {
  currentDate: new Date(),
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  orders: [],
  capacityByDay: {}, // { 'YYYY-MM-DD': { pieces: number, orders: [] } }
};

/**
 * Initialize the calendar
 */
function initCalendar() {
  console.log('Initializing Production Calendar...');
  updateMonthDisplay();
  loadCalendarData();
}

/**
 * Load orders and calculate capacity for the current month
 */
async function loadCalendarData() {
  try {
    // Get first and last day of current view (including overflow from adjacent months)
    const firstDay = new Date(calendarState.currentYear, calendarState.currentMonth, 1);
    const lastDay = new Date(calendarState.currentYear, calendarState.currentMonth + 1, 0);

    // Extend range to include visible days from adjacent months
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - (startDate.getDay() === 0 ? 6 : startDate.getDay() - 1));

    const endDate = new Date(lastDay);
    const daysToAdd = endDate.getDay() === 0 ? 0 : 7 - endDate.getDay();
    endDate.setDate(endDate.getDate() + daysToAdd);

    // Fetch orders from API
    const response = await fetch(`${API_BASE}/orders/calendar?start=${formatDateISO(startDate)}&end=${formatDateISO(endDate)}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Error loading calendar data');
    }

    const result = await response.json();

    if (result.success) {
      calendarState.orders = result.data || [];
      calculateCapacityByDay();
      renderCalendar();
      updateCalendarStats();
    }
  } catch (error) {
    console.error('Error loading calendar data:', error);
    // Use existing orders from state if API fails
    if (state && state.orders) {
      calendarState.orders = state.orders;
      calculateCapacityByDay();
      renderCalendar();
      updateCalendarStats();
    }
  }
}

/**
 * Calculate capacity usage for each day
 */
function calculateCapacityByDay() {
  calendarState.capacityByDay = {};

  calendarState.orders.forEach(order => {
    // Use production_deadline or estimate based on order date
    const deadlineDate = order.production_deadline || order.productionDeadline;
    if (!deadlineDate) return;

    const dateKey = deadlineDate.split('T')[0];

    // Calculate total pieces for this order
    const totalPieces = calculateOrderPieces(order);

    if (!calendarState.capacityByDay[dateKey]) {
      calendarState.capacityByDay[dateKey] = {
        pieces: 0,
        orders: []
      };
    }

    calendarState.capacityByDay[dateKey].pieces += totalPieces;
    calendarState.capacityByDay[dateKey].orders.push({
      id: order.id,
      orderNumber: order.orderNumber || order.order_number,
      clientName: order.clientName || order.client_name,
      pieces: totalPieces,
      status: order.status,
      eventDate: order.eventDate || order.event_date
    });
  });
}

/**
 * Calculate total pieces in an order
 */
function calculateOrderPieces(order) {
  let total = 0;

  // Try to get from items
  if (order.items && Array.isArray(order.items)) {
    total = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  // Fallback: estimate from total price (if we know average price per piece)
  if (total === 0 && order.totalPrice) {
    // Rough estimate: ~$25 per piece average
    total = Math.round(order.totalPrice / 25);
  }

  // Fallback to a default
  if (total === 0) {
    total = 100; // Default assumption
  }

  return total;
}

/**
 * Render the calendar grid
 */
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const firstDay = new Date(calendarState.currentYear, calendarState.currentMonth, 1);
  const lastDay = new Date(calendarState.currentYear, calendarState.currentMonth + 1, 0);

  // Get the day of week for the first day (0 = Sunday)
  let startDayOfWeek = firstDay.getDay();
  // Convert to Monday-based (0 = Monday)
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  let html = '';

  // Add empty cells for days before the first of the month
  const prevMonth = new Date(calendarState.currentYear, calendarState.currentMonth, 0);
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonth.getDate() - i;
    const dateKey = formatDateISO(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day));
    html += renderDayCell(day, dateKey, true);
  }

  // Add cells for current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateKey = formatDateISO(new Date(calendarState.currentYear, calendarState.currentMonth, day));
    html += renderDayCell(day, dateKey, false);
  }

  // Add cells for days after the last of the month
  const endDayOfWeek = lastDay.getDay();
  const daysToAdd = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  for (let day = 1; day <= daysToAdd; day++) {
    const dateKey = formatDateISO(new Date(calendarState.currentYear, calendarState.currentMonth + 1, day));
    html += renderDayCell(day, dateKey, true);
  }

  grid.innerHTML = html;
}

/**
 * Render a single day cell
 */
function renderDayCell(day, dateKey, isOtherMonth) {
  const dayData = calendarState.capacityByDay[dateKey] || { pieces: 0, orders: [] };
  const capacityPercent = Math.round((dayData.pieces / CALENDAR_CONFIG.dailyCapacity) * 100);
  const isWeekend = isWeekendDay(dateKey);
  const isToday = dateKey === formatDateISO(new Date());

  // Determine capacity class
  let capacityClass = 'capacity-low';
  if (capacityPercent >= 100) {
    capacityClass = 'capacity-full';
  } else if (capacityPercent >= 80) {
    capacityClass = 'capacity-high';
  } else if (capacityPercent >= 50) {
    capacityClass = 'capacity-medium';
  }

  // Build order dots HTML
  let orderDotsHtml = '';
  if (dayData.orders.length > 0) {
    const maxDots = Math.min(dayData.orders.length, 4);
    orderDotsHtml = '<div class="order-dots">';
    for (let i = 0; i < maxDots; i++) {
      const statusColor = getStatusColor(dayData.orders[i].status);
      orderDotsHtml += `<span class="order-dot" style="background: ${statusColor};" title="${dayData.orders[i].orderNumber}"></span>`;
    }
    if (dayData.orders.length > 4) {
      orderDotsHtml += `<span class="order-dot-more">+${dayData.orders.length - 4}</span>`;
    }
    orderDotsHtml += '</div>';
  }

  return `
    <div class="calendar-cell ${isOtherMonth ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${capacityClass}"
         onclick="showDayDetail('${dateKey}')"
         data-date="${dateKey}">
      <div class="cell-header">
        <span class="day-number">${day}</span>
        ${dayData.orders.length > 0 ? `<span class="order-count">${dayData.orders.length}</span>` : ''}
      </div>
      ${dayData.pieces > 0 ? `
        <div class="capacity-indicator">
          <div class="capacity-bar">
            <div class="capacity-fill" style="width: ${Math.min(capacityPercent, 100)}%;"></div>
          </div>
          <span class="capacity-text">${dayData.pieces.toLocaleString()}</span>
        </div>
      ` : ''}
      ${orderDotsHtml}
    </div>
  `;
}

/**
 * Get status color for order dot
 */
function getStatusColor(status) {
  const colors = {
    'pending_review': '#f59e0b',
    'pending': '#f59e0b',
    'approved': '#3b82f6',
    'in_production': '#8b5cf6',
    'ready': '#10b981',
    'shipped': '#06b6d4',
    'completed': '#22c55e',
    'cancelled': '#ef4444'
  };
  return colors[status] || '#9ca3af';
}

/**
 * Check if a date is a weekend
 */
function isWeekendDay(dateKey) {
  const date = new Date(dateKey + 'T12:00:00');
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Update month display in header
 */
function updateMonthDisplay() {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const display = document.getElementById('calendar-month-year');
  if (display) {
    display.textContent = `${monthNames[calendarState.currentMonth]} ${calendarState.currentYear}`;
  }
}

/**
 * Navigate to previous month
 */
function previousMonth() {
  calendarState.currentMonth--;
  if (calendarState.currentMonth < 0) {
    calendarState.currentMonth = 11;
    calendarState.currentYear--;
  }
  updateMonthDisplay();
  loadCalendarData();
}

/**
 * Navigate to next month
 */
function nextMonth() {
  calendarState.currentMonth++;
  if (calendarState.currentMonth > 11) {
    calendarState.currentMonth = 0;
    calendarState.currentYear++;
  }
  updateMonthDisplay();
  loadCalendarData();
}

/**
 * Go to today's date
 */
function goToToday() {
  const today = new Date();
  calendarState.currentMonth = today.getMonth();
  calendarState.currentYear = today.getFullYear();
  updateMonthDisplay();
  loadCalendarData();
}

/**
 * Show details for a specific day
 */
function showDayDetail(dateKey) {
  const panel = document.getElementById('day-detail-panel');
  const dayData = calendarState.capacityByDay[dateKey] || { pieces: 0, orders: [] };

  // Format date for display
  const date = new Date(dateKey + 'T12:00:00');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = date.toLocaleDateString('es-MX', options);

  // Update header
  document.getElementById('day-detail-title').textContent = formattedDate;

  // Update capacity bar
  const capacityPercent = Math.round((dayData.pieces / CALENDAR_CONFIG.dailyCapacity) * 100);
  const capacityFill = document.getElementById('day-capacity-fill');
  capacityFill.style.width = `${Math.min(capacityPercent, 100)}%`;
  capacityFill.className = 'capacity-bar-fill';

  if (capacityPercent >= 100) {
    capacityFill.classList.add('full');
  } else if (capacityPercent >= 80) {
    capacityFill.classList.add('high');
  } else if (capacityPercent >= 50) {
    capacityFill.classList.add('medium');
  }

  // Update text
  document.getElementById('day-pieces-used').textContent = dayData.pieces.toLocaleString();
  document.getElementById('day-pieces-total').textContent = CALENDAR_CONFIG.dailyCapacity.toLocaleString();
  document.getElementById('day-capacity-percent').textContent = `${capacityPercent}%`;

  // Render orders list
  const ordersList = document.getElementById('day-orders-list');

  if (dayData.orders.length === 0) {
    ordersList.innerHTML = `
      <div class="no-orders">
        <span style="font-size: 32px;">📅</span>
        <p>No hay pedidos programados para este día</p>
      </div>
    `;
  } else {
    ordersList.innerHTML = dayData.orders.map(order => `
      <div class="day-order-item" onclick="openOrderFromCalendar(${order.id})">
        <div class="order-item-header">
          <span class="order-number">${order.orderNumber}</span>
          <span class="order-status status-${order.status}">${getStatusLabel(order.status)}</span>
        </div>
        <div class="order-item-body">
          <span class="client-name">${order.clientName}</span>
          <span class="pieces-count">${order.pieces.toLocaleString()} piezas</span>
        </div>
        ${order.eventDate ? `
          <div class="order-event-date">
            <span>Evento: ${formatDateDisplay(order.eventDate)}</span>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  // Show panel
  panel.classList.remove('hidden');
}

/**
 * Close day detail panel
 */
function closeDayDetail() {
  document.getElementById('day-detail-panel').classList.add('hidden');
}

/**
 * Open order detail from calendar
 */
async function openOrderFromCalendar(orderId) {
  closeDayDetail();

  // First check if order exists in main state (from dashboard.js)
  if (typeof state !== 'undefined' && state.orders) {
    const existingOrder = state.orders.find(o => o.id == orderId || o.id === orderId.toString());
    if (existingOrder) {
      showOrderDetail(existingOrder);
      return;
    }
  }

  // If not found, fetch the full order details from API
  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        showOrderDetail(result.data);
        return;
      }
    }
  } catch (error) {
    console.error('Error fetching order:', error);
  }

  // Fallback: switch to orders view and reload
  alert('Abriendo pedido...');
  switchView('orders');
  loadOrders();
}

/**
 * Get status label in Spanish
 */
function getStatusLabel(status) {
  const labels = {
    'pending_review': 'Pendiente',
    'pending': 'Pendiente',
    'approved': 'Aprobado',
    'in_production': 'En Producción',
    'ready': 'Listo',
    'shipped': 'Enviado',
    'completed': 'Completado',
    'cancelled': 'Cancelado'
  };
  return labels[status] || status;
}

/**
 * Format date for display
 */
function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/**
 * Update calendar statistics
 */
function updateCalendarStats() {
  const firstDay = new Date(calendarState.currentYear, calendarState.currentMonth, 1);
  const lastDay = new Date(calendarState.currentYear, calendarState.currentMonth + 1, 0);

  let totalOrders = 0;
  let totalPieces = 0;
  let daysFull = 0;
  let daysWithOrders = 0;
  let totalCapacityUsed = 0;

  // Count stats for current month only
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateKey = formatDateISO(new Date(calendarState.currentYear, calendarState.currentMonth, day));
    const dayData = calendarState.capacityByDay[dateKey];

    if (dayData && dayData.orders.length > 0) {
      totalOrders += dayData.orders.length;
      totalPieces += dayData.pieces;
      daysWithOrders++;
      totalCapacityUsed += (dayData.pieces / CALENDAR_CONFIG.dailyCapacity) * 100;

      if (dayData.pieces >= CALENDAR_CONFIG.dailyCapacity) {
        daysFull++;
      }
    }
  }

  // Update display
  document.getElementById('cal-total-orders').textContent = totalOrders;
  document.getElementById('cal-total-pieces').textContent = totalPieces.toLocaleString();
  document.getElementById('cal-days-full').textContent = daysFull;

  const avgCapacity = daysWithOrders > 0 ? Math.round(totalCapacityUsed / daysWithOrders) : 0;
  document.getElementById('cal-avg-capacity').textContent = `${avgCapacity}%`;
}

/**
 * Find next available date with capacity
 * Used when creating new orders to automatically assign production deadline
 */
function findNextAvailableDate(piecesNeeded, startDate = new Date()) {
  let checkDate = new Date(startDate);
  let attempts = 0;
  const maxAttempts = 60; // Don't look more than 60 days ahead

  while (attempts < maxAttempts) {
    // Skip weekends
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0) {
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }
    if (dayOfWeek === 6) {
      checkDate.setDate(checkDate.getDate() + 2);
      continue;
    }

    const dateKey = formatDateISO(checkDate);
    const dayData = calendarState.capacityByDay[dateKey] || { pieces: 0 };
    const availableCapacity = CALENDAR_CONFIG.dailyCapacity - dayData.pieces;

    if (availableCapacity >= piecesNeeded) {
      return dateKey;
    }

    checkDate.setDate(checkDate.getDate() + 1);
    attempts++;
  }

  // If no date found with full capacity, return the next business day
  return formatDateISO(startDate);
}

// Initialize calendar when view is shown
document.addEventListener('DOMContentLoaded', function() {
  // Add click handler for calendar nav item
  const calendarNavItem = document.querySelector('[data-view="calendar"]');
  if (calendarNavItem) {
    calendarNavItem.addEventListener('click', function() {
      initCalendar();
    });
  }
});
