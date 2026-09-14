// Cash counting state
let cashCountingData = [];
let verifiedDeposit = 0;
let validationCallback = null;

/**
 * Initialize the cash counting calculator
 * @param {number} deposit - Verified deposit amount
 * @param {function} callback - Validation callback
 */
function initCashCounting(deposit, callback) {
  verifiedDeposit = deposit;
  validationCallback = callback;
  cashCountingData = [];

  // Reset all inputs
  const denominationInputs = document.querySelectorAll('.denomination-input');
  const coinsInput = document.querySelector('.coins-input');

  denominationInputs.forEach(input => input.value = '');
  coinsInput.value = '';

  // Initialize denomination data
  const denominations = [500, 200, 100, 50, 20, 10];

  denominations.forEach(value => {
    cashCountingData.push({
      value: value,
      count: 0,
      total: 0
    });
  });

  // Add coins entry
  cashCountingData.push({
    value: 0,
    count: 0,
    total: 0
  });

  // Add event listeners
  denominationInputs.forEach((input, index) => {
    input.addEventListener('input', () => updateCashCount(index, input.value));
  });

  coinsInput.addEventListener('input', () => {
    const coinsValue = parseFloat(coinsInput.value) || 0;
    cashCountingData[cashCountingData.length - 1].total = coinsValue;
    updateTotals();
  });

  // Initialize totals
  updateTotals();
}

/**
 * Update cash count for a denomination
 * @param {number} index - Index of denomination
 * @param {string} value - Input value
 */
function updateCashCount(index, value) {
  const count = parseInt(value) || 0;
  const denomination = cashCountingData[index];

  denomination.count = count;
  denomination.total = count * denomination.value;

  updateTotals();
}

/**
 * Update totals and validation
 */
function updateTotals() {
  let cashTotal = 0;

  // Calculate cash total
  for (let i = 0; i < cashCountingData.length - 1; i++) {
    cashTotal += cashCountingData[i].total;
  }

  const coins = cashCountingData[cashCountingData.length - 1].total;
  const grandTotal = cashTotal + coins;

  // Update UI
  document.getElementById('cashTotal').textContent = `₹${cashTotal.toFixed(2)}`;
  document.getElementById('coinsAmount').textContent = `₹${coins.toFixed(2)}`;
  document.getElementById('grandTotal').textContent = `₹${grandTotal.toFixed(2)}`;

  // Calculate difference
  const difference = verifiedDeposit - grandTotal;
  const absDifference = Math.abs(difference);

  document.getElementById('differenceAmount').textContent = `₹${absDifference.toFixed(2)}`;

  // Update message
  const messageElement = document.getElementById('differenceMessage');
  let isValid = false;

  if (Math.abs(difference) < 0.01) {
    messageElement.innerHTML = `<div class="success">✅ Perfect match! Amounts are equal</div>`;
    isValid = true;
  } else if (difference > 0) {
    messageElement.innerHTML = `<div class="warning">ℹ️ Additional ₹${absDifference.toFixed(2)} needed to match deposit</div>`;
  } else {
    messageElement.innerHTML = `<div class="error">⚠️ ₹${absDifference.toFixed(2)} over the required amount</div>`;
  }

  // Notify validation status
  if (validationCallback) {
    validationCallback(isValid);
  }
}

/**
 * Get current cash counting data
 * @returns {Array} Cash counting data
 */
function getCashCountingData() {
  return cashCountingData;
}

export { initCashCounting, getCashCountingData };
