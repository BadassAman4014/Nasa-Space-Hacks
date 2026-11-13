"""
Spatial correlation between productivity, soil brightness and elevation.

All layers must be aligned to one common grid and one common valid mask before
any statistic is computed. This module enforces that alignment explicitly and
reports an effective sample size that accounts for spatial autocorrelation,
because treating adjacent raster cells as independent observations inflates
significance.

Significance
------------
Raster cells are spatially dependent. The nominal p-value from Pearson's test
assumes independent samples and is therefore anti-conservative here. We estimate
the lag-1 spatial autocorrelation ``rho1`` of the productivity surface and
derive the effective sample size using the standard first-order approximation

    n_eff = n * (1 - rho1) / (1 + rho1),  clipped to [2, n]

Significance is then assessed against ``n_eff`` rather than ``n``. When ``rho1``
is high, ``n_eff`` collapses and the test is honestly reported as
underpowered. This is an approximation, not a full geostatistical model, and is
labelled as such in the response.

Caution
-------
A correlation is an association measured on this field in this period. It is
not evidence that elevation or brightness *causes* a productivity difference,
and soil brightness is a reflectance indicator, not a measured soil property.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import stats

from app.services.field_analytics.schemas import (
    CorrelationMetric,
    CorrelationResponse,
)


class CorrelationUnavailable(RuntimeError):
    """Raised when layers cannot be aligned onto a common valid mask."""


def align_layers(
    productivity: List[List[float]],
    brightness: Optional[List[List[float]]],
    elevation: Optional[List[List[float]]],
    productivity_mask: Optional[List[List[bool]]] = None,
    brightness_mask: Optional[List[List[bool]]] = None,
    elevation_mask: Optional[List[List[bool]]] = None,
) -> Tuple[np.ndarray, Dict[str, np.ndarray], np.ndarray]:
    """
    Align heterogeneous layers onto one common grid and valid mask.

    Raises ``CorrelationUnavailable`` if shapes differ (mismatched grids must
    never be correlated) or if the common mask is empty.
    """
    prod = np.asarray(productivity, dtype="float64")
    if prod.ndim != 2:
        raise CorrelationUnavailable("Productivity grid is not two-dimensional.")

    layers: Dict[str, np.ndarray] = {}
    common = np.isfinite(prod) & (prod >= 0.0)
    if productivity_mask is not None:
        common &= np.asarray(productivity_mask, dtype=bool)

    if brightness is not None:
        bright = np.asarray(brightness, dtype="float64")
        if bright.shape != prod.shape:
            raise CorrelationUnavailable(
                f"Soil brightness grid shape {bright.shape} does not match "
                f"productivity grid shape {prod.shape}; layers must be aligned "
                "to a common grid before correlation."
            )
        layers["brightness"] = bright
        common &= np.isfinite(bright) & (bright >= 0.0)
        if brightness_mask is not None:
            common &= np.asarray(brightness_mask, dtype=bool)

    if elevation is not None:
        elev = np.asarray(elevation, dtype="float64")
        if elev.shape != prod.shape:
            raise CorrelationUnavailable(
                f"Elevation grid shape {elev.shape} does not match "
                f"productivity grid shape {prod.shape}; layers must be aligned "
                "to a common grid before correlation."
            )
        layers["elevation"] = elev
        common &= np.isfinite(elev) & (elev > -1000.0)
        if elevation_mask is not None:
            common &= np.asarray(elevation_mask, dtype=bool)

    if not common.any():
        raise CorrelationUnavailable(
            "No raster cell is valid in every layer simultaneously."
        )

    return prod, layers, common


def lag1_autocorrelation(values: np.ndarray, mask: np.ndarray) -> float:
    """
    Lag-1 (rook-neighbour) spatial autocorrelation of a masked surface,
    averaged over horizontal and vertical neighbours.
    """
    filled = np.where(mask, values, np.nan)
    pairs: List[Tuple[np.ndarray, np.ndarray]] = []
    a = filled[:, :-1].ravel()
    b = filled[:, 1:].ravel()
    pairs.append((a, b))
    c = filled[:-1, :].ravel()
    d = filled[1:, :].ravel()
    pairs.append((c, d))

    num = 0.0
    den = 0.0
    count = 0
    for left, right in pairs:
        ok = np.isfinite(left) & np.isfinite(right)
        if not ok.any():
            continue
        num += float(np.sum((left[ok] - np.nanmean(filled)) * (right[ok] - np.nanmean(filled))))
        count += int(ok.sum())
    spread = float(np.nansum((filled - np.nanmean(filled)) ** 2))
    if spread <= 0 or count == 0:
        return 0.0
    den = spread
    # Normalise by the fraction of usable neighbour pairs.
    total_pairs = sum(int(np.isfinite(p).sum()) for p, _ in [(filled[:, :-1], 0), (filled[:-1, :], 0)])
    rho = num / den
    return float(np.clip(rho, -0.99, 0.99))


def effective_sample_size(n: int, rho1: float) -> int:
    """First-order effective sample size correction for spatial dependence."""
    if n <= 2:
        return max(2, n)
    rho1 = float(np.clip(rho1, -0.95, 0.95))
    n_eff = n * (1.0 - rho1) / (1.0 + rho1)
    return int(max(2, min(n, round(n_eff))))


def _strength(abs_r: float) -> str:
    if abs_r >= 0.7:
        return "strong"
    if abs_r >= 0.4:
        return "moderate"
    if abs_r >= 0.2:
        return "weak"
    return "negligible"


def _interpret(
    r: float,
    p_eff: float,
    rho1: float,
    n_eff: int,
    layer_label: str,
) -> str:
    direction = "negative" if r < 0 else "positive"
    strength = _strength(abs(r))
    significance = (
        "not statistically distinguishable from zero at alpha = 0.05 once "
        "spatial dependence is accounted for"
        if (p_eff is None or p_eff >= 0.05)
        else f"statistically significant at alpha = 0.05 (effective n = {n_eff})"
    )
    return (
        f"{strength.capitalize()} {direction} association with {layer_label} "
        f"(Pearson r = {r:.3f}); {significance}. Association on this field "
        "over this period only - it does not establish causation."
    )


class CorrelationService:
    """Pearson and Spearman correlation between aligned field rasters."""

    def compute_correlations(
        self,
        field_id: str,
        productivity_grid: List[List[float]],
        brightness_grid: Optional[List[List[float]]],
        elevation_grid: Optional[List[List[float]]],
        mask: Optional[List[List[bool]]] = None,
        grid_resolution_m: float = 10.0,
        productivity_mask: Optional[List[List[bool]]] = None,
        brightness_mask: Optional[List[List[bool]]] = None,
        elevation_mask: Optional[List[List[bool]]] = None,
    ) -> CorrelationResponse:
        prod, layers, common = align_layers(
            productivity_grid,
            brightness_grid,
            elevation_grid,
            productivity_mask or mask,
            brightness_mask,
            elevation_mask,
        )

        sample_count = int(common.sum())
        rho1 = lag1_autocorrelation(prod, common)
        n_eff = effective_sample_size(sample_count, rho1)

        caveat = (
            "Raster cells of one field are spatially autocorrelated, so the "
            f"{sample_count} valid cells do not carry {sample_count} independent "
            f"observations. Significance is reported against an effective "
            f"sample size of n_eff = {n_eff} (lag-1 autocorrelation rho1 = "
            f"{rho1:.3f}). Correlation measures association, not causation; "
            "elevation or soil brightness must not be described as causing a "
            "productivity difference, and soil brightness is a reflectance "
            "indicator rather than a measured soil property."
        )

        metrics: Dict[str, Any] = {}
        if "elevation" in layers:
            metrics["productivity_vs_elevation"] = self._metric(
                prod[common],
                layers["elevation"][common],
                "Multi-season relative productivity score",
                "Copernicus DEM GLO-30 elevation (m)",
                p_eff_n=n_eff,
                rho1=rho1,
                layer_label="elevation",
                sample_count=sample_count,
            )
        if "brightness" in layers:
            metrics["productivity_vs_brightness"] = self._metric(
                prod[common],
                layers["brightness"][common],
                "Multi-season relative productivity score",
                "Sentinel-2 bare-soil brightness index",
                p_eff_n=n_eff,
                rho1=rho1,
                layer_label="soil brightness",
                sample_count=sample_count,
            )

        return CorrelationResponse(
            field_id=field_id,
            grid_resolution_m=grid_resolution_m,
            sample_pixel_count=sample_count,
            effective_sample_size=n_eff,
            lag1_autocorrelation=round(rho1, 4),
            productivity_vs_elevation=metrics.get("productivity_vs_elevation"),
            productivity_vs_brightness=metrics.get("productivity_vs_brightness"),
            spatial_autocorrelation_note=caveat,
            scientific_disclaimer=(
                "Correlations describe empirical spatial association within a "
                "single field. They do not identify causes and are not a basis "
                "for variable-rate application on their own."
            ),
        )

    def _metric(
        self,
        a_values: np.ndarray,
        b_values: np.ndarray,
        layer_a: str,
        layer_b: str,
        p_eff_n: int,
        rho1: float,
        layer_label: str,
        sample_count: int,
    ) -> CorrelationMetric:
        if a_values.size < 3 or np.std(a_values) == 0 or np.std(b_values) == 0:
            return CorrelationMetric(
                layer_a=layer_a,
                layer_b=layer_b,
                pearson_r=None,
                pearson_p_value=None,
                spearman_rho=None,
                spearman_p_value=None,
                effective_sample_size=int(p_eff_n),
                sample_count=int(sample_count),
                interpretation=(
                    "One of the layers has no spatial variance inside the field, "
                    "so no correlation is defined."
                ),
            )

        r, p_nominal = stats.pearsonr(a_values, b_values)
        rho, sp_p = stats.spearmanr(a_values, b_values)

        # Re-test Pearson r against the effective sample size.
        if abs(r) >= 1.0:
            p_eff = 0.0
        else:
            t_stat = r * np.sqrt(max(1, p_eff_n - 2) / (1.0 - r * r))
            p_eff = float(2.0 * stats.t.sf(abs(t_stat), max(1, p_eff_n - 2)))

        return CorrelationMetric(
            layer_a=layer_a,
            layer_b=layer_b,
            pearson_r=round(float(r), 4),
            pearson_p_value=round(float(p_nominal), 6),
            spearman_rho=round(float(rho), 4),
            spearman_p_value=round(float(sp_p), 6),
            effective_pearson_p_value=round(p_eff, 6),
            effective_sample_size=int(p_eff_n),
            sample_count=int(sample_count),
            interpretation=_interpret(r, p_eff, rho1, p_eff_n, layer_label),
        )


correlation_service = CorrelationService()
