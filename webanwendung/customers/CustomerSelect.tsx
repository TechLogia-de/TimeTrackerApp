import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKundenMitarbeiterKI } from '@/hooks/useKundenMitarbeiterKI';
import { useAI } from '@/context/AIContext';

interface CustomerSelectProps {
  value: string;
  onChange: (value: string) => void;
  customers: { id: string; name: string }[];
  label?: string;
  error?: string;
  required?: boolean;
  projektName?: string;
  projektId?: string;
  kategorie?: string;
  beschreibung?: string;
}

export const CustomerSelect = ({ 
  value, 
  onChange, 
  customers, 
  label, 
  error, 
  required,
  projektName,
  projektId,
  kategorie,
  beschreibung
}: CustomerSelectProps) => {
  const { getVorschlaegeFuerKunde } = useKundenMitarbeiterKI();
  const { aiSettings } = useAI();
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  
  // Initialisiere selectedCustomer, wenn value bereits gesetzt ist
  useEffect(() => {
    if (value && !selectedCustomer) {
      const customer = customers.find(c => c.id === value);
      if (customer) {
        setSelectedCustomer(customer);
      }
    }
  }, [value, customers, selectedCustomer]);
  
  // Auto-Vorschläge nur anfordern, wenn BEIDE - Kunde UND Projekt - ausgewählt sind
  useEffect(() => {
    // Nur fortfahren, wenn KI aktiviert, ein Kunde ausgewählt ist UND ein Projekt vorhanden ist
    if (aiSettings?.enabled && selectedCustomer?.id && projektId && projektName) {
      console.log('✅ Kunde und Projekt sind beide ausgewählt - KI-Analyse wird gestartet');
      
      // Kleine Verzögerung, damit die UI nicht blockiert
      const timer = setTimeout(() => {
        setLoadingAI(true);
        
        getVorschlaegeFuerKunde({
          kundeId: selectedCustomer.id,
          kundeName: selectedCustomer.name,
          projektId: projektId,
          projektName: projektName,
          kategorie,
          beschreibung
        })
        .finally(() => {
          setLoadingAI(false);
        });
      }, 500);
      
      return () => clearTimeout(timer);
    } else if (selectedCustomer?.id && !projektId) {
      console.log('⚠️ Kunde ausgewählt, aber noch kein Projekt - warte auf Projektauswahl');
    }
  }, [selectedCustomer, projektId, projektName, aiSettings?.enabled, kategorie, beschreibung]);
  
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setSelectedCustomer(customer);
    }
    onChange(customerId);
  };
  
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          {loadingAI && (
            <span className="text-xs text-muted-foreground animate-pulse">
              KI analysiert Mitarbeiter...
            </span>
          )}
        </div>
      )}
      <Select value={value} onValueChange={handleCustomerChange}>
        <SelectTrigger className={error ? "border-red-500" : ""}>
          <SelectValue placeholder="Kunde auswählen" />
        </SelectTrigger>
        <SelectContent>
          {customers.map(customer => (
            <SelectItem key={customer.id} value={customer.id}>
              {customer.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};
