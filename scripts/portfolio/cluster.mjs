const finite = value => typeof value === 'number' && Number.isFinite(value);

export const clusterSymbols = positions => [...new Set(positions.filter(position => position.assetType !== 'cash').map(position => position.symbol))].sort();

export function portfolioClusterAnalysis(input, positions) {
  const symbols = clusterSymbols(positions);
  const n = symbols.length;
  if (!input || input.schemaVersion !== 1 || JSON.stringify(input.symbols) !== JSON.stringify(symbols) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) ||
      input.startDate >= input.endDate || !Number.isSafeInteger(input.observations) || input.observations < 120 ||
      !Array.isArray(input.correlation) || input.correlation.length !== n ||
      input.correlation.some((row, i) => !Array.isArray(row) || row.length !== n ||
        row.some((value, j) => !finite(value) || value < -1.000001 || value > 1.000001 ||
          Math.abs(value - input.correlation[j]?.[i]) > 1e-8)) ||
      !Array.isArray(input.leafOrder) || input.leafOrder.length !== n ||
      new Set(input.leafOrder).size !== n || input.leafOrder.some(value => !Number.isInteger(value) || value < 0 || value >= n) ||
      !Array.isArray(input.branches) || input.branches.length !== n - 1 ||
      input.branches.some(branch => !Array.isArray(branch.x) || !Array.isArray(branch.y) ||
        branch.x.length !== 4 || branch.y.length !== 4 ||
        [...branch.x, ...branch.y].some(value => !finite(value))) ||
      !Array.isArray(input.groups) || input.groups.length !== n ||
      input.groups.some(value => !Number.isInteger(value) || value < 0 || value >= Math.min(8, n)) ||
      !Array.isArray(input.coordinates) || input.coordinates.length !== n ||
      input.coordinates.some(row => !Array.isArray(row) || row.length !== 3 || row.some(value => !finite(value)))) return null;
  return input;
}
