// Port allocation limits & requirements, the Citizens Bank Fund as of October 26, establishes the following allocations:
// 5% Cash, 15% Bonds, 8% Commodities, 8% International, 64% Equities so yeah
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AssetClass {
    Bonds,
    Commodities,
    International,
    Equities,
}

impl AssetClass {
    pub const ALL: [Self; 4] = [
        Self::Bonds,
        Self::Commodities,
        Self::International,
        Self::Equities,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Bonds => "Bonds",
            Self::Commodities => "Commodities",
            Self::International => "International",
            Self::Equities => "Equities",
        }
    }
}

#[derive(Clone, Copy)]
pub struct Caps {
    pub cash: f64,
    pub bonds: f64,
    pub commodities: f64,
    pub international: f64,
    pub equities: f64,
}

impl Caps {
    pub fn limit(self, class: AssetClass) -> f64 {
        match class {
            AssetClass::Bonds => self.bonds,
            AssetClass::Commodities => self.commodities,
            AssetClass::International => self.international,
            AssetClass::Equities => self.equities,
        }
    }
}

pub struct Constraints {
    pub caps: Caps,
    pub classes: Vec<AssetClass>,
    groups: Vec<(Vec<usize>, f64)>,
}

impl Constraints {
    pub fn new(classes: Vec<AssetClass>, caps: Caps) -> Result<Self, String> {
        let limits = [
            caps.cash,
            caps.bonds,
            caps.commodities,
            caps.international,
            caps.equities,
        ];
        if limits
            .iter()
            .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
            || (limits.iter().sum::<f64>() - 1.0).abs() > 1e-12
        {
            return Err("Allocation targets must be finite, nonnegative, and sum to 100%".into());
        }
        let mut groups = Vec::new();
        for class in AssetClass::ALL {
            let indices: Vec<usize> = classes
                .iter()
                .enumerate()
                .filter_map(|(i, value)| (*value == class).then_some(i))
                .collect();
            let limit = caps.limit(class);
            if indices.is_empty() && limit > 0.0 {
                return Err(format!(
                    "No assets available for the {} allocation",
                    class.label()
                ));
            }
            groups.push((indices, limit));
        }
        Ok(Self {
            caps,
            classes,
            groups,
        })
    }

    pub fn total(&self, weights: &[f64], class: AssetClass) -> f64 {
        weights
            .iter()
            .zip(&self.classes)
            .filter_map(|(w, c)| (*c == class).then_some(w))
            .sum()
    }

    fn project(&self, values: &[f64]) -> Vec<f64> {
        let mut weights = vec![0.0; values.len()];
        for (indices, budget) in &self.groups {
            if *budget == 0.0 {
                continue;
            }
            let mut sorted: Vec<f64> = indices.iter().map(|i| values[*i]).collect();
            sorted.sort_by(|a, b| b.total_cmp(a));
            let mut sum = 0.0;
            let mut threshold = 0.0;
            for (i, value) in sorted.iter().enumerate() {
                sum += value;
                let candidate = (sum - budget) / (i + 1) as f64;
                if *value > candidate {
                    threshold = candidate;
                }
            }
            for i in indices {
                weights[*i] = (values[*i] - threshold).max(0.0);
            }
        }
        weights
    }

    fn feasible(&self, weights: &[f64]) -> bool {
        weights.len() == self.classes.len()
            && weights.iter().all(|w| w.is_finite() && *w >= 0.0)
            && self.groups.iter().all(|(indices, budget)| {
                (indices.iter().map(|i| weights[*i]).sum::<f64>() - budget).abs() < 1e-9
            })
    }
}

// Maximize mu'w - lambda/2 w'Sigma w, with weights measured against total NAV.
// Caps sum to one, so full allocation lowkey makes every class cap an equality.
pub fn optimize(
    mu: &[f64],
    covariance: &[Vec<f64>],
    lambda: f64,
    constraints: &Constraints,
) -> Result<Vec<f64>, String> {
    let n = mu.len();
    if n == 0
        || constraints.classes.len() != n
        || covariance.len() != n
        || covariance
            .iter()
            .any(|row| row.len() != n || row.iter().any(|v| !v.is_finite()))
        || mu.iter().any(|v| !v.is_finite())
        || !lambda.is_finite()
        || lambda <= 0.0
    {
        return Err("Invalid constrained optimization inputs".into());
    }
    let bound = covariance
        .iter()
        .map(|row| row.iter().map(|v| v.abs()).sum::<f64>())
        .fold(0.0_f64, f64::max);
    let step = 1.0 / (lambda * bound);
    if !step.is_finite() || step <= 0.0 {
        return Err("Invalid optimization step".into());
    }
    let mut weights = constraints.project(&vec![0.0; n]);
    for _ in 0..200_000 {
        let sigma_w = super::multiply(covariance, &weights);
        let moved: Vec<f64> = (0..n)
            .map(|i| weights[i] + step * (mu[i] - lambda * sigma_w[i]))
            .collect();
        if moved.iter().any(|v| !v.is_finite()) {
            return Err("Non-finite optimization iterate".into());
        }
        let next = constraints.project(&moved);
        let residual = next
            .iter()
            .zip(&weights)
            .map(|(a, b)| ((a - b) / step).abs())
            .fold(0.0_f64, f64::max);
        if residual < 1e-12 && constraints.feasible(&next) {
            return Ok(next);
        }
        weights = next;
    }
    Err("Constrained optimizer did not converge to a feasible stationary allocation".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn caps() -> Caps {
        Caps {
            cash: 0.05,
            bonds: 0.20,
            commodities: 0.08,
            international: 0.08,
            equities: 0.59,
        }
    }

    #[test]
    fn validates_policy_and_missing_classes() {
        let classes = AssetClass::ALL.to_vec();
        for bad in [f64::NAN, -0.05, 0.15] {
            assert!(
                Constraints::new(
                    classes.clone(),
                    Caps {
                        cash: bad,
                        ..caps()
                    }
                )
                .is_err()
            );
        }
        assert!(Constraints::new(vec![AssetClass::Equities], caps()).is_err());
    }

    #[test]
    fn analytic_solution_uses_cross_class_covariance() {
        let policy = Caps {
            cash: 0.10,
            bonds: 0.30,
            commodities: 0.0,
            international: 0.0,
            equities: 0.60,
        };
        let constraints = Constraints::new(
            vec![
                AssetClass::Bonds,
                AssetClass::Equities,
                AssetClass::Equities,
            ],
            policy,
        )
        .unwrap();
        let covariance = vec![
            vec![1.0, 0.20, 0.0],
            vec![0.20, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
        ];
        let result = optimize(&[0.0, 0.10, 0.0], &covariance, 1.0, &constraints).unwrap();
        // With bond weight fixed at .3, equity weights solve x + y = .6, x - y = .1 - .2*.3.
        for (actual, expected) in result.iter().zip([0.30, 0.32, 0.28]) {
            assert!((actual - expected).abs() < 1e-8);
        }
    }

    #[test]
    fn extreme_view_cannot_breach_a_class_cap() {
        let constraints = Constraints::new(
            vec![
                AssetClass::Bonds,
                AssetClass::Commodities,
                AssetClass::International,
                AssetClass::Equities,
                AssetClass::Equities,
            ],
            caps(),
        )
        .unwrap();
        let covariance: Vec<Vec<f64>> = (0..5)
            .map(|i| (0..5).map(|j| if i == j { 1.0 } else { 0.0 }).collect())
            .collect();
        let result = optimize(
            &[0.0, 0.0, 0.0, 100.0, -100.0],
            &covariance,
            1.0,
            &constraints,
        )
        .unwrap();
        assert!(constraints.feasible(&result));
        assert!((result[3] - 0.59).abs() < 1e-9);
        assert_eq!(result[4], 0.0);
        assert!((result.iter().sum::<f64>() + constraints.caps.cash - 1.0).abs() < 1e-9);
    }
}
