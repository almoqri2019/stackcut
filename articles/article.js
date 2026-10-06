const weeklyInput = document.getElementById("weekly-price");
const yearlyInput = document.getElementById("yearly-price");

function updateBurnCalculator() {
  const weekly = Number(weeklyInput.value);
  const yearly = Number(yearlyInput.value);
  const weeklyMonthly = weekly * 52 / 12;
  const yearlyMonthly = yearly / 12;
  document.getElementById("weekly-value").textContent = weekly.toFixed(0);
  document.getElementById("weekly-monthly").textContent = weeklyMonthly.toFixed(2);
  document.getElementById("weekly-formula").textContent = `$${weekly} × 52 ÷ 12`;
  document.getElementById("weekly-estimate").textContent = (weekly * 4).toFixed(2);
  document.getElementById("weekly-leak").textContent = (weeklyMonthly - weekly * 4).toFixed(2);
  document.getElementById("yearly-value").textContent = yearly.toFixed(0);
  document.getElementById("yearly-monthly").textContent = yearlyMonthly.toFixed(2);
  document.getElementById("yearly-formula").textContent = `$${yearly} ÷ 12`;
}

weeklyInput.addEventListener("input", updateBurnCalculator);
yearlyInput.addEventListener("input", updateBurnCalculator);
document.querySelectorAll("[data-weekly-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    weeklyInput.value = button.dataset.weeklyPreset;
    updateBurnCalculator();
  });
});
updateBurnCalculator();

const schema = document.querySelector('script[type="application/ld+json"]');
const schemaPreview = document.getElementById("schema-preview");
if (schema && schemaPreview) schemaPreview.textContent = JSON.stringify(JSON.parse(schema.textContent), null, 2);
