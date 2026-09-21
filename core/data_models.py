from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class PropertyData:
    adres: str
    type: str
    bouwjaar: int
    woonoppervlak: float
    energielabel: str
    perceel: float = 0
    kenmerken: Dict[str, str] = field(default_factory=dict)


@dataclass
class ValuationResult:
    valuation: float
    price_per_square_meter: float


@dataclass
class RentalResult:
    annual_rendement: float
    gross_yield: float


@dataclass
class MortgageResult:
    monthly_payment: float
    total_repayment: float


@dataclass
class MarketTrend:
    trend: str
    change: float
    period: str


@dataclass
class PropertyRecord:
    property_id: str
    data: PropertyData
