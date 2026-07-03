"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapLayers } from "@/types";

const IGN_TILE_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

interface ReportMapProps {
  lat: number;
  lon: number;
  layers: MapLayers | null;
}

type LayerKey = "sitesPollues" | "transactions";

export function ReportMap({ lat, lon, layers }: ReportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    sitesPollues: true,
    transactions: true,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          ign: {
            type: "raster",
            tiles: [IGN_TILE_URL],
            tileSize: 256,
            attribution: "© IGN Géoplateforme",
          },
        },
        layers: [{ id: "ign", type: "raster", source: "ign" }],
      },
      center: [lon, lat],
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Map is created once; lat/lon changes are handled by flyTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.flyTo({ center: [lon, lat], zoom: 15 });
  }, [lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const propertyMarker = new maplibregl.Marker({ color: "#234a4d" })
      .setLngLat([lon, lat])
      .addTo(map);
    markersRef.current.push(propertyMarker);

    if (layers && visible.sitesPollues) {
      for (const site of layers.sitesPollues) {
        const marker = new maplibregl.Marker({ color: "#a86a15" })
          .setLngLat([site.lon, site.lat])
          .setPopup(new maplibregl.Popup().setText(site.nom))
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    if (layers && visible.transactions) {
      for (const tx of layers.transactions) {
        const marker = new maplibregl.Marker({ color: "#3a7276", scale: 0.7 })
          .setLngLat([tx.lon, tx.lat])
          .setPopup(
            new maplibregl.Popup().setText(
              tx.prixM2
                ? `${Math.round(tx.prixM2).toLocaleString("fr-FR")} €/m² — ${tx.dateMutation}`
                : tx.dateMutation,
            ),
          )
          .addTo(map);
        markersRef.current.push(marker);
      }
    }
  }, [layers, visible, lat, lon]);

  return (
    <div className="overflow-hidden rounded-2xl border border-primary-100 shadow-sm">
      <div className="flex flex-wrap gap-3 border-b border-primary-100 bg-surface px-4 py-2 text-sm">
        {layers && layers.sitesPollues.length > 0 && (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={visible.sitesPollues}
              onChange={(e) => setVisible((v) => ({ ...v, sitesPollues: e.target.checked }))}
            />
            Sites et sols pollués ({layers.sitesPollues.length})
          </label>
        )}
        {layers && layers.transactions.length > 0 && (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={visible.transactions}
              onChange={(e) => setVisible((v) => ({ ...v, transactions: e.target.checked }))}
            />
            Transactions DVF alentour ({layers.transactions.length})
          </label>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-80 w-full sm:h-96"
        role="img"
        aria-label="Carte du bien et de son environnement"
      />
    </div>
  );
}
