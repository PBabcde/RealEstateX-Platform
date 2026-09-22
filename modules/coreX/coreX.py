from typing import Any, Dict, List

from modules.phase2_base import load_module, module_result, save_module, timestamp


class CoreX:
    """Orchestrator for registries, events, audits and workflows."""

    DEFAULT_MODULES = [
        "EnergyX", "RealEstateX", "CRM", "MarketplaceX", "InvestorHubX",
        "AnalyticsX", "RAGSuperEngineX",
    ]

    def __init__(self) -> None:
        self.state = load_module("coreX", {
            "modules": self.DEFAULT_MODULES,
            "services": [],
            "events": [],
            "audit": [],
        })

    def register_module(self, name: str, service: str) -> dict:
        if name not in self.state["modules"]:
            self.state["modules"].append(name)
        if service not in self.state["services"]:
            self.state["services"].append(service)
        save_module("coreX", self.state)
        return module_result("CoreX", {"registered": {"module": name, "service": service}})

    def publish_event(self, event: str, payload: Dict[str, Any]) -> dict:
        record = {"event": event, "payload": payload, "at": timestamp()}
        self.state["events"].append(record)
        self.state["events"] = self.state["events"][-100:]
        self.state["audit"].append(record)
        self.state["audit"] = self.state["audit"][-200:]
        save_module("coreX", self.state)
        return module_result("CoreX", {"event": record})

    def orchestrate(self, workflow: str, steps: List[str]) -> dict:
        return module_result("CoreX", {
            "workflow": workflow,
            "steps": [{"name": step, "status": "queued"} for step in steps],
        })

    def health(self) -> dict:
        return module_result("CoreX", {
            "connectedModules": self.state["modules"],
            "activeServices": self.state["services"],
            "eventCount": len(self.state["events"]),
            "auditCount": len(self.state["audit"]),
        })