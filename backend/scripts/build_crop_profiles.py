"""
Build backend/app/data/crop_profiles.json from public documents.

Nothing in the output is typed from memory:

* EcoCrop numbers (temperature, rainfall, killing temperature, family) are read from the FAO EcoCrop
  database CSV and copied verbatim.
* Germany planting/harvest windows for the cereals, rapeseed and sugar beet are read from the
  Sacks et al. (2010) crop calendar CSV.
* DüV Anlage 4 values (Tables 2, 3, 7), rooting depths (FAO-56 Table 22), legume calendars and
  rotation break years were read from the cited documents on the retrieval date and are entered
  below together with the document, the exact wording they were derived from, and `verify=True`
  wherever the document is guidance and not law, or where a phrase had to be turned into dates.

A crop is `eligible` for scoring only when every attribute the four-axis scorer needs is sourced.
Crops with a gap stay in the file, flagged with what is missing, so the UI can show why they are not
offered as a recommendation.

Run from backend/:  python scripts/build_crop_profiles.py
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

RETRIEVED = "2026-11-15"
OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "crop_profiles.json"

ECOCROP_URL = "https://huggingface.co/datasets/rockerBOO/ecocrop/resolve/main/EcoCrop_DB.csv"
SACKS_URL = "https://sage-public-files.s3.amazonaws.com/crop-calendar-dataset/All_data_with_climate.csv"


def doy(month: int, day: int) -> int:
    """Day of year in a non-leap year."""
    return date(2001, month, day).timetuple().tm_yday


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310 - fixed https URLs above
        return r.read()


SOURCES = {
    "ecocrop": {
        "name": "FAO EcoCrop database (EcoCrop_DB.csv, mirrored by OpenCLIM/ecocrop and rockerBOO/ecocrop)",
        "url": "https://huggingface.co/datasets/rockerBOO/ecocrop",
        "original": "https://gaez.fao.org/pages/ecocrop",
        "note": "Species-level, global. Temperatures are mean daily air temperatures in deg C, rainfall in mm per growing cycle as used by the OpenCLIM EcoCrop model.",
    },
    "sacks2010": {
        "name": "Sacks, Deryng, Foley, Ramankutty (2010): Crop planting dates, Global Ecology and Biogeography 19, 607-620. Crop Calendar Dataset (national level, Germany, source: MWCACP Updates)",
        "url": "https://sage.nelson.wisc.edu/data-and-models/datasets/crop-calendar-dataset/",
        "note": "National Germany windows, not Brandenburg-specific.",
    },
    "duev_anlage4": {
        "name": "Düngeverordnung (DüV) Anlage 4: Tabellen 2, 3 und 7",
        "url": "https://www.gesetze-im-internet.de/d_v_2017/anlage_4.html",
        "note": "Federal law text. Table 2 lists no N requirement value for grain legumes, so none is assumed.",
    },
    "fao56_t22": {
        "name": "FAO Irrigation and Drainage Paper 56, Table 22: maximum effective rooting depth",
        "url": "https://www.fao.org/4/x0490e/x0490e0e.htm",
        "note": "Rye and lupin are not listed, so they get no rooting depth.",
    },
    "lfl_erbse_ff": {
        "name": "LfL Bayern: Erbse - Fruchtfolge und Bodenbearbeitung",
        "url": "https://www.lfl.bayern.de/ipz/oelfruechte/066675/",
        "note": "Bavarian advisory page.",
    },
    "lfl_erbse_saat": {
        "name": "LfL Bayern: Erbse - Saat",
        "url": "https://www.lfl.bayern.de/ipz/oelfruechte/066683/",
        "note": "Bavarian advisory page.",
    },
    "lfl_erbse_ernte": {
        "name": "LfL Bayern: Erbse (Ernte)",
        "url": "https://lfl.bayern.de/ipz/oelfruechte/067195/index.php",
        "note": "Bavarian advisory page; states harvest readiness in the first half of August.",
    },
    "lfl_ackerbohne_ff": {
        "name": "LfL Bayern: Ackerbohne - Fruchtfolge und Bodenbearbeitung",
        "url": "https://lfl.bayern.de/ipz/oelfruechte/068565/index.php",
        "note": "Bavarian advisory page.",
    },
    "lfl_ackerbohne_saat": {
        "name": "LfL Bayern: Ackerbohne (Saat)",
        "url": "https://lfl.bayern.de/ipz/oelfruechte/068567/index.php",
        "note": "Bavarian advisory page.",
    },
    "lfl_ackerbohne_ernte": {
        "name": "LfL Bayern: Ackerbohne - Ernte",
        "url": "https://www.lfl.bayern.de/ipz/oelfruechte/068617/index.php",
        "note": "Bavarian advisory page.",
    },
    "bzl_fruchtfolge": {
        "name": "BZL (BLE): Die Fruchtfolge in der Landwirtschaft (updated 28 Aug 2025)",
        "url": "https://www.landwirtschaft.de/tier-und-pflanze/pflanze/nutzpflanzen-allgemein/die-fruchtfolge-in-der-landwirtschaft",
        "note": "Federal information service of the BMLEH.",
    },
    "oekolandbau_lupine": {
        "name": "BZL oekolandbau.de: Lupinenanbau in der ökologischen Landwirtschaft",
        "url": "https://www.oekolandbau.de/bio-in-der-praxis/oekologische-landwirtschaft/oekologischer-pflanzenbau/bio-anbausteckbriefe/koernerleguminosen/lupinen/",
        "note": "Federal information service; refers to the blue lupin (L. angustifolius).",
    },
    "tll_ww": {
        "name": "TLL Thüringen: Leitlinie Winterweizen (8th ed. 2015)",
        "url": "https://www.tll.de/www/daten/publikationen/leitlinien/ll_ww.pdf",
        "note": "Regional guideline from Thuringia.",
    },
    "tll_wra": {
        "name": "TLL Thüringen: Leitlinie Winterraps",
        "url": "https://www.tll.de/www/daten/publikationen/leitlinien/ll_wra.pdf",
        "note": "Regional guideline from Thuringia.",
    },
}


def src(key: str, ref: str, verify: bool = False, **extra):
    return {"source": key, "ref": ref, "verify": verify, **extra}


# --- manually entered, document-derived values -------------------------------------------------

#: DüV Anlage 4 Table 2 (N requirement at reference yield) and Table 3 (yield correction per step).
DUEV_T2 = {
    "winter_wheat": dict(row="Winterweizen A, B", n=230, y=80, unit="dt/ha", step=10),
    "winter_barley": dict(row="Wintergerste", n=180, y=70, unit="dt/ha", step=10),
    "winter_rye": dict(row="Winterroggen", n=170, y=70, unit="dt/ha", step=10),
    "winter_triticale": dict(row="Wintertriticale", n=190, y=70, unit="dt/ha", step=10),
    "winter_rapeseed": dict(row="Winterraps", n=200, y=40, unit="dt/ha", step=5),
    "silage_maize": dict(row="Silomais", n=200, y=450, unit="dt/ha", step=50),
    "sugar_beet": dict(row="Zuckerrübe", n=170, y=650, unit="dt/ha", step=100),
    "potato": dict(row="Kartoffel", n=180, y=450, unit="dt/ha", step=50),
}
#: Table 3: (up per step, down per step). Potato 10/10, others 10/15.
DUEV_T3_DOWN = {"potato": 10}

#: Table 7: minimum deduction (kg N/ha) in the following crop, by previous main crop.
DUEV_T7 = {
    "winter_rapeseed": (10, "Raps, Körnerleguminosen, Kohlgemüse: 10"),
    "faba_bean": (10, "Raps, Körnerleguminosen, Kohlgemüse: 10"),
    "field_pea": (10, "Raps, Körnerleguminosen, Kohlgemüse: 10"),
    "blue_lupin": (10, "Raps, Körnerleguminosen, Kohlgemüse: 10"),
    "sugar_beet": (10, "Zuckerrüben ohne Blattbergung: 10 (leaves left on the field)"),
    "winter_wheat": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
    "winter_barley": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
    "winter_rye": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
    "winter_triticale": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
    "silage_maize": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
    "potato": (0, "Getreide (mit und ohne Stroh), Silomais, Körnermais, Kartoffel: 0"),
}

#: FAO-56 Table 22 maximum effective rooting depth range (m).
FAO56_ROOT = {
    "winter_wheat": ((1.5, 1.8), "Winter Wheat"),
    "winter_barley": ((1.0, 1.5), "Barley"),
    "winter_rapeseed": ((1.0, 1.5), "Rapeseed, Canola"),
    "sugar_beet": ((0.7, 1.2), "Sugar Beet"),
    "potato": ((0.4, 0.6), "Potato"),
    "faba_bean": ((0.5, 0.7), "Fababean (broad bean) - Dry/Seed"),
    "field_pea": ((0.6, 1.0), "Peas - Dry/Seed"),
    "silage_maize": ((1.0, 1.7), "Maize, Field (grain) (field corn); silage maize not listed separately"),
}

#: Calendars not available in the Sacks Germany rows. Dates are an interpretation of the quoted words.
MANUAL_CALENDAR = {
    "faba_bean": dict(
        sow=(doy(3, 1), doy(4, 10)), harvest=(doy(8, 1), doy(9, 30)),
        sow_ref=("lfl_ackerbohne_saat", "'von März bis spätestens Anfang April' read as 1 March to 10 April"),
        harvest_ref=("lfl_ackerbohne_ernte", "'Im August/September ... sind Ackerbohnen zur Ernte reif' read as 1 Aug to 30 Sep"),
    ),
    "field_pea": dict(
        sow=(doy(3, 21), doy(4, 30)), harvest=(doy(8, 1), doy(8, 15)),
        sow_ref=("lfl_erbse_saat", "'ab Ende März bis spätestens Ende April' read as 21 March to 30 April"),
        harvest_ref=("lfl_erbse_ernte", "'In der ersten Augusthälfte sind Körnererbsen i.d.R. erntereif' read as 1 to 15 Aug"),
    ),
    "blue_lupin": dict(
        sow=(doy(3, 15), doy(4, 10)), harvest=(doy(8, 25), doy(9, 30)),
        sow_ref=("oekolandbau_lupine", "'zwischen Mitte März und Anfang April' read as 15 March to 10 April (terminal types to mid-April)"),
        harvest_ref=("oekolandbau_lupine", "'Endständige Sorten reifen Ende August ... Verzweigungstypen ... bis Ende September' read as 25 Aug to 30 Sep"),
    ),
}

#: Rotation break (years without the same crop) from advisory sources. Only the stated lower bound is used.
BREAK_YEARS = {
    "field_pea": (5, 6, "lfl_erbse_ff", "'muss eine Anbaupause von 5 bis 6 Jahren eingehalten werden'"),
    "faba_bean": (4, 5, "lfl_ackerbohne_ff", "'sollte eine Anbaupause von mindestens 4 bis 5 Jahren eingehalten werden'"),
    "blue_lupin": (6, None, "oekolandbau_lupine", "'Anbaupausen von mindestens sechs Jahren eingehalten werden'"),
    "winter_wheat": (2, 3, "bzl_fruchtfolge", "'bei Weizen in der Regel zwei bis drei Jahre Anbaupause ausreichen'"),
}

#: Rapeseed: TLL says to avoid self-succession; no number of years is given for the general case.
BREAK_YEARS["winter_rapeseed"] = (1, None, "tll_wra", "'Selbstfolge unbedingt vermeiden (hoher Schaderreger- und Krankheitsdruck)' read as: not in consecutive years")
#: All other crops: BZL's general statement that arable crops are rotated yearly. Read as: not in consecutive years.
DEFAULT_BREAK = (1, None, "bzl_fruchtfolge", "'Bei typischen Ackerkulturen wie Getreide, Raps, Kartoffeln ... hat es sich bewährt, jährlich die Felder für den Anbau zu wechseln' read as: not in consecutive years")

#: N fixation (kg N/ha) where an advisory source gives a number. Informational, not used for the legal calculation.
N_FIXATION = {
    "field_pea": (150, "lfl_erbse_ff", "'biologische Stickstofffixierung beträgt im Durchschnitt 150 kg N/ha'"),
    "faba_bean": (170, "lfl_ackerbohne_ff", "'im Durchschnitt 170 kg N/ha, wovon für die Nachfrucht ca. 30 kg zur Verfügung stehen'"),
}

CROPS = [
    # id, label en, label de, EcoPortCode, EcoCrop scientific name, Sacks (Crop, Qualifier) or None, grain legume
    ("winter_wheat", "Winter wheat", "Winterweizen", "2114", ("Wheat", "Winter"), False),
    ("winter_barley", "Winter barley", "Wintergerste", "1232", ("Barley", "Winter"), False),
    ("winter_rye", "Winter rye", "Winterroggen", "1929", ("Rye", "Winter"), False),
    ("winter_triticale", "Winter triticale", "Wintertriticale", None, None, False),
    ("winter_rapeseed", "Winter oilseed rape", "Winterraps", "549", ("Rapeseed", "Winter"), False),
    ("silage_maize", "Silage maize", "Silomais", "2175", None, False),
    ("sugar_beet", "Sugar beet", "Zuckerrübe", "48742", ("Sugarbeets", ""), False),
    ("potato", "Potato", "Kartoffel", "1971", None, False),
    ("faba_bean", "Field bean (faba)", "Ackerbohne", "2146", None, True),
    ("field_pea", "Field pea", "Körnererbse", "1721", None, True),
    ("blue_lupin", "Blue lupin", "Blaue Lupine", "2519", None, True),
]


def num(v: str):
    v = (v or "").strip()
    if v in ("", "NA"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> int:
    print("downloading EcoCrop and Sacks ...")
    eco_bytes = fetch(ECOCROP_URL)
    sacks_bytes = fetch(SACKS_URL)
    eco = {r["EcoPortCode"]: r for r in csv.DictReader(io.StringIO(eco_bytes.decode("utf-8", "replace")))}
    sacks_rows = list(csv.DictReader(io.StringIO(sacks_bytes.decode("utf-8", "replace"))))
    sacks_de = {(r["Crop"], r["Qualifier"]): r for r in sacks_rows if r["Location"] == "Germany" and r["Level"] == "N"}

    SOURCES["ecocrop"]["sha256"] = hashlib.sha256(eco_bytes).hexdigest()
    SOURCES["sacks2010"]["sha256"] = hashlib.sha256(sacks_bytes).hexdigest()

    crops = {}
    for cid, en, de, eco_code, sacks_key, legume in CROPS:
        a: dict = {}
        missing: list[str] = []

        # EcoCrop -------------------------------------------------------------------------------
        if eco_code and eco_code in eco:
            r = eco[eco_code]
            a["botanical_family"] = {
                "value": r["FAMNAME"].split(":")[-1],
                **src("ecocrop", f"EcoPortCode {eco_code}, {r['ScientificName']}, FAMNAME"),
            }
            a["ecocrop"] = {
                "value": {
                    "scientific_name": r["ScientificName"],
                    "tmin": num(r["TMIN"]), "topmn": num(r["TOPMN"]), "topmx": num(r["TOPMX"]), "tmax": num(r["TMAX"]),
                    "rmin": num(r["RMIN"]), "ropmn": num(r["ROPMN"]), "ropmx": num(r["ROPMX"]), "rmax": num(r["RMAX"]),
                    "killing_temp_early": num(r["KTMP"]), "killing_temp_rest": num(r["KTMPR"]),
                    "cycle_days_min": num(r["GMIN"]), "cycle_days_max": num(r["GMAX"]),
                },
                **src("ecocrop", f"EcoPortCode {eco_code}", verify=True,
                      note="Species-level values. Winter and spring forms are not distinguished."),
            }
        else:
            missing += ["botanical_family", "ecocrop"]

        # Calendar ------------------------------------------------------------------------------
        cal = None
        if sacks_key and sacks_key in sacks_de:
            r = sacks_de[sacks_key]
            ps, pe, pm = int(r["Plant.start"]), int(r["Plant.end"]), float(r["Plant.median"])
            hs, he, hm = int(r["Harvest.start"]), int(r["Harvest.end"]), float(r["Harvest.median"])
            cal = {
                "value": {
                    "sow_start_doy": ps, "sow_end_doy": pe, "sow_median_doy": pm,
                    "harvest_start_doy": hs, "harvest_end_doy": he, "harvest_median_doy": hm,
                    "winter_sown": ps > 150 and hs < 250 and ps > hs,
                },
                **src("sacks2010", f"Germany, national, {r['Crop']} {r['Qualifier']} (Data.ID {r['Data.ID']}), planting {r['Plant.start.date']}-{r['Plant.end.date']}, harvest {r['Harvest.start.date']}-{r['Harvest.end.date']}", verify=True),
            }
        elif cid in MANUAL_CALENDAR:
            m = MANUAL_CALENDAR[cid]
            cal = {
                "value": {
                    "sow_start_doy": m["sow"][0], "sow_end_doy": m["sow"][1], "sow_median_doy": (m["sow"][0] + m["sow"][1]) / 2,
                    "harvest_start_doy": m["harvest"][0], "harvest_end_doy": m["harvest"][1], "harvest_median_doy": (m["harvest"][0] + m["harvest"][1]) / 2,
                    "winter_sown": False,
                },
                **src(m["sow_ref"][0], f"sowing: {m['sow_ref'][1]}; harvest ({m['harvest_ref'][0]}): {m['harvest_ref'][1]}", verify=True,
                      note="Words in the source were converted to dates; the median is the midpoint of the window."),
            }
        if cal:
            a["calendar"] = cal
        else:
            missing.append("calendar")

        # DüV -------------------------------------------------------------------------------------
        if cid in DUEV_T2:
            t = DUEV_T2[cid]
            a["duev_n_requirement"] = {
                "value": {
                    "n_kg_ha": t["n"], "reference_yield": t["y"], "yield_unit": t["unit"],
                    "yield_step": t["step"], "up_kg_per_step": 10, "down_kg_per_step": DUEV_T3_DOWN.get(cid, 15), "max_up_kg": 40,
                },
                **src("duev_anlage4", f"Table 2 row '{t['row']}' ({t['y']} dt/ha, {t['n']} kg N/ha); Table 3 yield correction", verify=False),
            }
        else:
            a["duev_n_requirement"] = {
                "value": None,
                **src("duev_anlage4", "Not listed in Table 2: no N requirement value exists for this crop in DüV Anlage 4.", verify=False),
            }
        if cid in DUEV_T7:
            kg, ref = DUEV_T7[cid]
            a["duev_previous_crop_deduction_kg_n_ha"] = {"value": kg, **src("duev_anlage4", f"Table 7: {ref}", verify=False)}

        # Rooting depth -------------------------------------------------------------------------
        if cid in FAO56_ROOT:
            (lo, hi), row = FAO56_ROOT[cid]
            a["rooting_depth_m"] = {"value": {"min": lo, "max": hi}, **src("fao56_t22", f"Table 22 row '{row}'", verify=(cid == "silage_maize"))}
        else:
            missing.append("rooting_depth_m")

        # Rotation break, N fixation ------------------------------------------------------------
        lo, hi, k, quote = BREAK_YEARS.get(cid, DEFAULT_BREAK)
        a["rotation_break_years"] = {"value": {"min": lo, "max": hi}, **src(k, quote, verify=True)}
        if cid in N_FIXATION:
            kg, k, quote = N_FIXATION[cid]
            a["n_fixation_kg_ha"] = {"value": kg, **src(k, quote, verify=True)}

        a["grain_legume"] = {
            "value": legume,
            **src("duev_anlage4", "Körnerleguminosen (Table 7 previous-crop group)" if legume else "Not a grain legume", verify=False),
        }

        eligible_needs = ["botanical_family", "ecocrop", "calendar", "rooting_depth_m"]
        for k in eligible_needs:
            if k not in a and k not in missing:
                missing.append(k)
        eligible = not [k for k in eligible_needs if k not in a]
        # EcoCrop fields the scorer reads must be present.
        if eligible:
            e = a["ecocrop"]["value"]
            for k in ("topmx", "tmax", "rmin", "ropmn", "ropmx", "rmax"):
                if e.get(k) is None:
                    eligible = False
                    missing.append(f"ecocrop.{k}")

        crops[cid] = {
            "id": cid, "label_en": en, "label_de": de,
            "attributes": a,
            "scoring": {"eligible": eligible, "missing": sorted(set(missing))},
        }

    doc = {
        "schema_version": 1,
        "retrieved": RETRIEVED,
        "generated_by": "backend/scripts/build_crop_profiles.py",
        "sources": SOURCES,
        "cover_crop": {
            "label_en": "Catch crop after harvest (non-legume)",
            "label_de": "Zwischenfrucht (Nichtleguminose)",
            "duev_previous_crop_deduction_kg_n_ha": {"value": 0, **src("duev_anlage4", "Table 7: Zwischenfrucht Nichtleguminosen, abgefroren 0; im Herbst eingearbeitet 0 (spring incorporation would be 20). The legal minimum of 0 is used.", verify=True)},
            "examples": {"value": ["Phacelia", "Gelbsenf", "Ölrettich", "Klee"], **src("bzl_fruchtfolge", "Named as typical Zwischenfrüchte by BZL; no species-level parameters are used.", verify=False)},
        },
        "crops": crops,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", OUT)
    for cid, c in crops.items():
        print(f"{cid:18s} eligible={c['scoring']['eligible']!s:5s} missing={c['scoring']['missing']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
