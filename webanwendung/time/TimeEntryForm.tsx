import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { TimeEntry, TimeEntryStatus } from "@/types/timeEntry";
import { Project } from "@/types/project";
import { Customer } from "@/types/customer";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { TimeEntryService, safeParseDate } from "@/lib/services/timeEntryService";
import { calculateWorkHours, validateTimeEntry } from "./TimeTracker";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Clock, CalendarIcon, Check, X, Timer, AlertCircle, ClipboardCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Validierungsschema für TimeEntry
const timeEntrySchema = z.object({
  date: z.date({
    required_error: "Bitte wählen Sie ein Datum",
  }),
  startTime: z.string({
    required_error: "Bitte geben Sie eine Startzeit ein",
  }).regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Bitte geben Sie eine gültige Zeit im Format HH:MM ein",
  }),
  endTime: z.string({
    required_error: "Bitte geben Sie eine Endzeit ein",
  }).regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Bitte geben Sie eine gültige Zeit im Format HH:MM ein",
  }),
  pauseMinutes: z.number().min(0, {
    message: "Die Pausenzeit muss positiv sein",
  }).max(480, {
    message: "Die Pausenzeit kann nicht länger als 8 Stunden sein",
  }).default(0),
  note: z.string().optional(),
  orderReference: z.boolean().default(false),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  projectId: z.string().optional(),
}).refine((data) => {
  // Prüfen, ob Endzeit nach Startzeit liegt
  const [startHour, startMinute] = data.startTime.split(":").map(Number);
  const [endHour, endMinute] = data.endTime.split(":").map(Number);
  const start = new Date(data.date);
  start.setHours(startHour, startMinute, 0);
  const end = new Date(data.date);
  end.setHours(endHour, endMinute, 0);
  
  return end > start;
}, {
  message: "Die Endzeit muss nach der Startzeit liegen",
  path: ["endTime"],
}).refine((data) => {
  // Wenn orderReference aktiviert ist, muss customerId angegeben werden
  return !data.orderReference || (data.orderReference && !!data.customerId);
}, {
  message: "Bei aktivierter Auftragszuordnung muss ein Kunde ausgewählt werden",
  path: ["customerId"],
});

type TimeEntryFormProps = {
  initialData?: Partial<TimeEntry>;
  customers?: Customer[];
  projects?: Project[];
  onSave?: (timeEntry: Partial<TimeEntry>) => void;
  onCancel?: () => void;
  onSuccess?: () => void;  // Callback bei erfolgreichem Speichern
  isEdit?: boolean;
  entryId?: string;  // ID des zu bearbeitenden Zeiteintrags
};

const TimeEntryForm = ({
  initialData,
  customers = [],
  projects = [],
  onSave,
  onCancel,
  onSuccess,
  isEdit = false,
  entryId,
}: TimeEntryFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [validationTriggered, setValidationTriggered] = useState(false);
  
  // Initialisieren des Formulars
  const form = useForm<z.infer<typeof timeEntrySchema>>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      date: initialData?.date ? safeParseDate(initialData.date) || new Date() : new Date(),
      startTime: initialData?.startTime 
        ? (initialData.startTime instanceof Date 
          ? format(initialData.startTime, "HH:mm") 
          : safeParseDate(initialData.startTime) 
            ? format(safeParseDate(initialData.startTime) as Date, "HH:mm")
            : "") 
        : "",
      endTime: initialData?.endTime 
        ? (initialData.endTime instanceof Date 
          ? format(initialData.endTime, "HH:mm") 
          : safeParseDate(initialData.endTime)
            ? format(safeParseDate(initialData.endTime) as Date, "HH:mm")
            : "") 
        : "",
      pauseMinutes: initialData?.pauseMinutes || 0,
      note: initialData?.note || "",
      orderReference: initialData?.customerId ? true : false,
      customerId: initialData?.customerId || "",
      projectId: initialData?.projectId || "",
    },
  });
  
  // Projekte filtern basierend auf ausgewähltem Kunden
  useEffect(() => {
    const customerId = form.watch("customerId");
    
    if (customerId) {
      setFilteredProjects(projects.filter(project => project.customerId === customerId));
    } else {
      setFilteredProjects([]);
    }
    
    // Bei Kundenwechsel das Projekt zurücksetzen
    if (customerId !== form.getValues("customerId")) {
      form.setValue("projectId", "");
    }
  }, [form.watch("customerId"), projects]);
  
  // Arbeitsdauer berechnen, wenn Zeit sich ändert
  useEffect(() => {
    const startTime = form.watch("startTime");
    const endTime = form.watch("endTime");
    const pauseMinutes = form.watch("pauseMinutes");
    const date = form.watch("date");
    
    if (startTime && endTime && date) {
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      
      const start = new Date(date);
      start.setHours(startHour, startMinute, 0);
      
      const end = new Date(date);
      end.setHours(endHour, endMinute, 0);
      
      if (end > start) {
        const hours = calculateWorkHours(start, end, pauseMinutes);
        setDuration(hours);
      } else {
        setDuration(null);
      }
    } else {
      setDuration(null);
    }
  }, [
    form.watch("startTime"),
    form.watch("endTime"),
    form.watch("pauseMinutes"),
    form.watch("date")
  ]);
  
  // Aktuelle Zeit eintragen
  const fillCurrentTime = (field: "startTime" | "endTime") => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    form.setValue(field, `${hours}:${minutes}`);
  };
  
  const onSubmit = async (values: z.infer<typeof timeEntrySchema>) => {
    if (!user) {
      toast({
        title: "Fehler",
        description: "Sie müssen angemeldet sein, um Zeiterfassungen zu speichern",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    setValidationTriggered(true);
    
    try {
      // Zeit-Objekte erstellen
      const [startHour, startMinute] = values.startTime.split(":").map(Number);
      const [endHour, endMinute] = values.endTime.split(":").map(Number);
      
      const startDate = new Date(values.date);
      startDate.setHours(startHour, startMinute, 0);
      
      const endDate = new Date(values.date);
      endDate.setHours(endHour, endMinute, 0);
      
      // Validierung
      const validation = validateTimeEntry(startDate, endDate, values.pauseMinutes);
      if (!validation.isValid) {
        toast({
          title: "Validierungsfehler",
          description: validation.message,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      // Arbeitsstunden berechnen
      const workHours = calculateWorkHours(startDate, endDate, values.pauseMinutes);
      
      // Zeiterfassung Objekt erstellen
      const timeEntry: Partial<TimeEntry> = {
        userId: user.uid,
        userName: user.displayName || "Unbekannter Benutzer",
        date: values.date,
        startTime: startDate,
        endTime: endDate,
        pauseMinutes: values.pauseMinutes,
        note: values.note,
        status: TimeEntryStatus.DRAFT,
      };
      
      // Optionale Felder hinzufügen, wenn Auftragszuordnung aktiviert ist
      if (values.orderReference) {
        timeEntry.customerId = values.customerId;
        
        // Kundenname hinzufügen
        const customer = customers.find(c => c.id === values.customerId);
        if (customer) {
          timeEntry.customerName = customer.name;
        }
        
        // Projekt hinzufügen, wenn ausgewählt
        if (values.projectId) {
          timeEntry.projectId = values.projectId;
          
          // Projektname hinzufügen
          const project = projects.find(p => p.id === values.projectId);
          if (project) {
            timeEntry.projectName = project.name;
          }
        }
      }
      
      // Callback aufrufen
      if (onSave) {
        onSave(timeEntry);
      }
      
      // Meldung ausgeben
      toast({
        title: isEdit ? "Zeiterfassung aktualisiert" : "Zeiterfassung gespeichert",
        description: isEdit ? "Ihre Zeiterfassung wurde erfolgreich aktualisiert" : "Ihre Zeiterfassung wurde erfolgreich gespeichert",
      });
      
      // Erfolgskallback aufrufen
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Zeiterfassung:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern der Zeiterfassung ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Card className="w-full max-w-2xl mx-auto shadow-sm">
      <CardHeader>
        <CardTitle>{isEdit ? "Zeiterfassung bearbeiten" : "Neue Zeiterfassung"}</CardTitle>
        <CardDescription>
          Erfassen Sie Ihre Arbeitszeiten und ordnen Sie sie optional einem Auftrag zu
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-6">
            {/* Datum */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="font-medium">Datum</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: de })
                          ) : (
                            <span>Wählen Sie ein Datum</span>
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
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Zeitbereich */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Startzeit */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Startzeit</FormLabel>
                    <div className="flex space-x-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="HH:MM"
                          className="flex-1"
                        />
                      </FormControl>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={() => fillCurrentTime("startTime")}
                        title="Aktuelle Zeit eintragen"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Endzeit */}
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Endzeit</FormLabel>
                    <div className="flex space-x-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="HH:MM"
                          className="flex-1"
                        />
                      </FormControl>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="icon"
                        onClick={() => fillCurrentTime("endTime")}
                        title="Aktuelle Zeit eintragen"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Pausenzeit */}
            <FormField
              control={form.control}
              name="pauseMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Pausenzeit (Minuten)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Geben Sie die Pausenzeit in Minuten ein
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Arbeitsdauer Anzeige */}
            <div className="bg-muted p-4 rounded-md flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Timer className="h-5 w-5 text-primary" />
                <span className="font-medium">Arbeitsdauer:</span>
              </div>
              {duration !== null ? (
                <Badge variant="secondary" className="text-lg py-1">
                  {duration.toFixed(2)} Stunden
                </Badge>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Bitte geben Sie Start- und Endzeit ein
                </span>
              )}
            </div>
            
            {/* Auftragszuordnung */}
            <FormField
              control={form.control}
              name="orderReference"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Auftragszuordnung</FormLabel>
                    <FormDescription>
                      Aktivieren Sie diese Option, um die Zeit einem Auftrag zuzuordnen
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            
            {/* Kundenauswahl und Projekt (nur wenn Auftragszuordnung aktiviert) */}
            {form.watch("orderReference") && (
              <div className="space-y-4 pt-2">
                <Separator />
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Auftragsinformationen
                </h3>
                
                {/* Kundenauswahl */}
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="customer-select" className="font-medium">Kunde</FormLabel>
                      <select
                        id="customer-select"
                        aria-label="Kundenauswahl"
                        value={field.value}
                        onChange={field.onChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">-- Bitte wählen Sie einen Kunden --</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Projektauswahl (nur wenn Kunde ausgewählt) */}
                {form.watch("customerId") && (
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="project-select" className="font-medium">Projekt</FormLabel>
                        <select
                          id="project-select"
                          aria-label="Projektauswahl"
                          value={field.value}
                          onChange={field.onChange}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">-- Bitte wählen Sie ein Projekt --</option>
                          {filteredProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <FormDescription>
                          Optional: Wählen Sie ein Projekt für genauere Zuordnung
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
            
            {/* Notizen */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-medium">Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Beschreiben Sie Ihre Tätigkeiten (optional)"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Geben Sie Informationen zu den durchgeführten Tätigkeiten ein
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
          </div>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Abbrechen
        </Button>
        <Button
          onClick={form.handleSubmit(onSubmit)}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Wird gespeichert..." : isEdit ? "Aktualisieren" : "Speichern"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default TimeEntryForm; 