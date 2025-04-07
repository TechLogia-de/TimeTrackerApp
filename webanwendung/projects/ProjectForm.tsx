import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/hooks/useAuth";
import { ProjectService } from "@/lib/services/projectService";
import { CustomerService } from "@/lib/services/customerService";
import { Project, ProjectFormData, PROJECT_STATUSES } from "@/types/project";
import { Customer } from "@/types/customer";
import { Calendar as CalendarIcon, Users, MapPin, Search } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserService } from "@/lib/services/userService";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { FiMapPin } from "react-icons/fi";
import apiClient, { mapsApi } from "../../lib/api";
import { debounce } from "lodash";

// Schema für das Projektformular
const projectFormSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein"),
  projectNumber: z.string().min(1, "Projektnummer ist erforderlich"),
  description: z.string().optional(),
  customerId: z.string().min(1, "Ein Kunde muss ausgewählt werden"),
  status: z.string().min(1, "Status ist erforderlich"),
  budget: z.string().optional(),
  startDate: z.date({ required_error: "Startdatum ist erforderlich" }),
  endDate: z.date().optional(),
  hourlyRate: z.string().optional(),
  isActive: z.boolean().default(true),
  managers: z.array(z.string()),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type ProjectFormProps = {
  initialData?: Project;
  onSubmit: (data: ProjectFormData) => void;
  onCancel: () => void;
};

const ProjectForm: React.FC<ProjectFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEditing = !!initialData;

  // Form-Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectNumber, setProjectNumber] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Google Maps autocomplete
  const mapInputRef = useRef<HTMLInputElement>(null);
  const [autocompletePredictions, setAutocompletePredictions] = useState<any[]>([]);
  const addressLoaded = useRef<boolean>(false);

  // Zusätzlicher State für die Kartenkoordinaten
  const [mapCoordinates, setMapCoordinates] = useState<{lat: number, lng: number, address: string} | null>(null);

  // Formular mit React Hook Form initialisieren
  const form = useForm<z.infer<typeof projectFormSchema>>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          budget: initialData.budget?.toString() || "",
          hourlyRate: initialData.hourlyRate?.toString() || "",
          managers: initialData.managers || [],
          address: initialData.address || "",
          latitude: initialData.latitude,
          longitude: initialData.longitude,
        }
      : {
          name: "",
          projectNumber: "",
          description: "",
          customerId: "",
          status: PROJECT_STATUSES.PENDING.id,
          budget: "",
          startDate: new Date(),
          endDate: undefined,
          hourlyRate: "",
          isActive: true,
          managers: [],
          notes: "",
          tags: [],
          address: "",
          latitude: undefined,
          longitude: undefined,
        },
  });

  // Laden von Kunden und Benutzern
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        // Kunden laden
        const customersData = await CustomerService.getActiveCustomers();
        setCustomers(customersData);

        // Benutzer laden
        const usersData = await UserService.getAllUsers();
        setUsers(usersData);

        // Nächste Projektnummer abrufen, wenn neues Projekt
        if (!isEditing) {
          const number = await ProjectService.getNextProjectNumber();
          setProjectNumber(number);
          form.setValue("projectNumber", number);
        }
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        toast({
          title: "Fehler",
          description: "Die benötigten Daten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isEditing, form]);

  // Google Maps Autocomplete initialisieren
  useEffect(() => {
    if (!mapInputRef.current || addressLoaded.current) return;

    addressLoaded.current = true;
    
    // Verwende Backend-Proxy für Autocomplete
    const autocompleteInput = mapInputRef.current;
    
    // Event-Listener für Benutzereingaben
    const handleInput = debounce(async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const input = target.value;
      
      if (input.length < 3) {
        setAutocompletePredictions([]);
        return;
      }
      
      try {
        console.log("Suche nach:", input);
        const predictions = await mapsApi.getAutocompleteResults(input);
        console.log("Gefundene Vorschläge:", predictions);
        setAutocompletePredictions(predictions);
      } catch (error) {
        console.error('Fehler beim Abrufen der Adressvorschläge:', error);
        setAutocompletePredictions([]);
      }
    }, 300);
    
    autocompleteInput.addEventListener('input', handleInput);
    
    // Cleanup-Funktion
    return () => {
      if (autocompleteInput) {
        autocompleteInput.removeEventListener('input', handleInput);
      }
    };
  }, []);

  // Funktion zum Auswählen einer Adresse aus den Vorschlägen
  const handleSelectAddress = async (prediction: any) => {
    try {
      console.log("Ausgewählte Adresse:", prediction.description);
      const place = await mapsApi.getPlaceDetails(prediction.place_id);
      console.log("Adressdetails erhalten:", place);
      
      const address = place.formatted_address;
      const lat = place.geometry.location.lat;
      const lng = place.geometry.location.lng;
      
      console.log(`Setze Adressdaten: ${address}, Lat: ${lat}, Lng: ${lng}`);
      
      // Formularwerte direkt setzen (ohne setValue)
      const updatedValues = {
        ...form.getValues(),
        address: address,
        latitude: lat,
        longitude: lng
      };
      
      // Komplettes Formular zurücksetzen mit neuen Werten
      form.reset(updatedValues);
      
      // Zusätzliche State-Variable für die Kartenanzeige
      setMapCoordinates({lat, lng, address});
      
      setAutocompletePredictions([]);
      
      // Bestätigungsmeldung anzeigen
      toast({
        title: "Adresse erfasst",
        description: "Die Adresse wurde erfolgreich erfasst.",
      });
    } catch (error) {
      console.error('Fehler beim Abrufen der Ortsdetails:', error);
      toast({
        title: "Fehler",
        description: "Die Adressdetails konnten nicht geladen werden.",
        variant: "destructive",
      });
    }
  };

  // Formular absenden
  const handleSubmit = async (values: z.infer<typeof projectFormSchema>) => {
    setIsSubmitting(true);
    try {
      // Debug-Informationen für Adressdaten
      const adressData = {
        address: typeof values.address === 'string' ? values.address : null,
        latitude: typeof values.latitude === 'number' ? values.latitude : null,
        longitude: typeof values.longitude === 'number' ? values.longitude : null
      };
      console.log("Formular wird abgesendet mit Adressdaten:", adressData);
      
      // Budget und hourlyRate in Zahlen umwandeln
      const formattedValues: ProjectFormData = {
        ...values,
        budget: values.budget ? parseFloat(values.budget) : undefined,
        hourlyRate: values.hourlyRate ? parseFloat(values.hourlyRate) : undefined,
      };

      onSubmit(formattedValues);
    } catch (error) {
      console.error("Fehler beim Speichern des Projekts:", error);
      toast({
        title: "Fehler",
        description: "Das Projekt konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Nach dem Laden der initialen Daten, setze mapCoordinates
  useEffect(() => {
    if (initialData?.latitude && initialData?.longitude && initialData?.address) {
      setMapCoordinates({
        lat: initialData.latitude,
        lng: initialData.longitude,
        address: initialData.address
      });
    }
  }, [initialData]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Grundlegende Projektinformationen */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Projektdaten</h3>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Projektname*</FormLabel>
                  <FormControl>
                    <Input placeholder="Neues Projekt" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="projectNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Projektnummer*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="P-00001"
                        {...field}
                        readOnly={!isEditing}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(PROJECT_STATUSES).map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            <div className="flex items-center">
                              <div
                                className="h-2 w-2 rounded-full mr-2"
                                style={{ backgroundColor: status.color }}
                              ></div>
                              {status.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kunde*</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Kunde auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Beschreibung des Projekts..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Adresse mit Google Maps Integration */}
            <div className="space-y-2">
              <label htmlFor="address" className="text-sm font-medium">
                Adresse
              </label>
              <div className="relative">
                <div className="flex items-center">
                  <FiMapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <Input
                    id="address"
                    type="text"
                    placeholder="Adresse suchen..."
                    ref={mapInputRef}
                    value={form.getValues('address') || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      form.setValue('address', value);
                      
                      // Manuell die Adresssuche auslösen, wenn die Eingabe über Event-Listener nicht funktioniert
                      if (value.length >= 3) {
                        console.log("Adresssuche mit:", value);
                        mapsApi.getAutocompleteResults(value)
                          .then(predictions => {
                            console.log("Empfangene Vorschläge:", predictions.length);
                            setAutocompletePredictions(predictions);
                          })
                          .catch(error => {
                            console.error('Fehler beim Abrufen der Adressvorschläge:', error);
                            setAutocompletePredictions([]);
                          });
                      } else {
                        setAutocompletePredictions([]);
                      }
                    }}
                    className="w-full pl-10"
                  />
                </div>
                
                {/* Anzahl der Vorschläge (Debug) */}
                <div className="text-xs text-gray-500 mt-1">
                  {autocompletePredictions.length > 0 ? 
                    `${autocompletePredictions.length} Vorschläge gefunden` : 
                    (form.getValues('address') && 
                     typeof form.getValues('address') === 'string' && 
                     (form.getValues('address') as string).length >= 3 ? 
                      'Keine Vorschläge gefunden' : '')}
                </div>
                
                {/* Autocomplete-Vorschläge */}
                {autocompletePredictions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto">
                    {autocompletePredictions.map((prediction) => (
                      <div
                        key={prediction.place_id}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => handleSelectAddress(prediction)}
                      >
                        {prediction.description}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Kartenanzeige, wenn Koordinaten vorhanden sind */}
            {mapCoordinates && mapCoordinates.lat && mapCoordinates.lng ? (
              <Card className="my-4">
                <CardContent className="p-0">
                  <div className="w-full h-48 relative">
                    <img
                      src={mapsApi.getStaticMapUrl(
                        mapCoordinates.lat,
                        mapCoordinates.lng,
                        15,
                        600,
                        300
                      )}
                      alt="Standort Karte"
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        console.error("Fehler beim Laden der Karte:", e);
                        const target = e.target as HTMLImageElement;
                        target.onerror = null; // Verhindert endlose Fehler-Loops
                        target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22600%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22600%22%20height%3D%22300%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%22300%22%20y%3D%22150%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999%22%3EKartenbild konnte nicht geladen werden%3C%2Ftext%3E%3C%2Fsvg%3E';
                      }}
                      loading="lazy"
                    />
                    <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-xs p-2 rounded">
                      {mapCoordinates.address}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-sm text-gray-500 mt-2">
                Keine Karte verfügbar. Bitte wählen Sie eine Adresse aus.
              </div>
            )}
          </div>

          {/* Zeitliche und finanzielle Informationen */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Zeit & Budget</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Startdatum*</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: de })
                            ) : (
                              <span>Datum auswählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Enddatum</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: de })
                            ) : (
                              <span>Datum auswählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date("1900-01-01") ||
                            (form.getValues("startDate") &&
                              date < form.getValues("startDate"))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10000"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hourlyRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stundensatz (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="80"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Interne Notizen zum Projekt..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        <div className="flex justify-end gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={isSubmitting || isLoadingData}>
            {isSubmitting
              ? "Wird gespeichert..."
              : isEditing
              ? "Projekt aktualisieren"
              : "Projekt anlegen"}
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default ProjectForm; 