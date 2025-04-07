import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserContract } from "@/types/user";

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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { userContractService } from "@/lib/db/userContracts";

// Form Schema für Vertragsarbeitszeiten
const contractSchema = z.object({
  contractWorkHours: z
    .number()
    .min(1, "Bitte geben Sie eine gültige Stundenzahl ein")
    .max(168, "Die wöchentliche Arbeitszeit kann nicht mehr als 168 Stunden betragen"),
  workDaysPerWeek: z
    .number()
    .min(1, "Bitte geben Sie mindestens einen Arbeitstag an")
    .max(7, "Es gibt maximal 7 Tage pro Woche"),
  workDays: z
    .array(z.string())
    .min(1, "Bitte wählen Sie mindestens einen Arbeitstag aus"),
  startDate: z.string().optional(),
  vacationDaysPerYear: z.number().min(0, "Urlaubstage können nicht negativ sein"),
  schedule: z.record(z.object({
    active: z.boolean().default(false),
    start: z.string().optional(),
    end: z.string().optional(),
    hours: z.number().min(0).optional(),
  })).optional(),
});

type FormValues = z.infer<typeof contractSchema>;

interface ContractHoursSettingsProps {
  userId?: string;
  isAdmin?: boolean;
  onSaved?: () => void;
  readOnly?: boolean;  // Schreibgeschützt-Modus für Vorschau
  onContractUpdated?: (contract: UserContract) => void; // Callback für Zeitkonto-Synchronisierung
}

// Wochentage
const WEEKDAYS = [
  { id: "monday", label: "Montag" },
  { id: "tuesday", label: "Dienstag" },
  { id: "wednesday", label: "Mittwoch" },
  { id: "thursday", label: "Donnerstag" },
  { id: "friday", label: "Freitag" },
  { id: "saturday", label: "Samstag" },
  { id: "sunday", label: "Sonntag" },
];

const ContractHoursSettings = ({ 
  userId, 
  isAdmin = false, 
  onSaved, 
  readOnly = false,
  onContractUpdated 
}: ContractHoursSettingsProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [userContract, setUserContract] = useState<UserContract | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  // Verhindert endlose Rekursion bei Arbeitszeitaktualisierungen
  const isUpdatingSchedule = useRef(false);
  
  // Verwende die übergebene userId oder die des aktuellen Benutzers
  const targetUserId = userId || user?.uid || "";
  
  // Formular Definition
  const form = useForm<FormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractWorkHours: 40,
      workDaysPerWeek: 5,
      workDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      vacationDaysPerYear: 30,
      schedule: {
        monday: { active: true, start: "09:00", end: "17:00", hours: 8 },
        tuesday: { active: true, start: "09:00", end: "17:00", hours: 8 },
        wednesday: { active: true, start: "09:00", end: "17:00", hours: 8 },
        thursday: { active: true, start: "09:00", end: "17:00", hours: 8 },
        friday: { active: true, start: "09:00", end: "17:00", hours: 8 },
        saturday: { active: false },
        sunday: { active: false },
      },
      startDate: format(new Date(), 'yyyy-MM-dd'),
    },
  });
  
  // Überprüfen der Bearbeitungsrechte
  useEffect(() => {
    const checkEditPermissions = async () => {
      try {
        let canUserEdit = false;
        
        // Admin kann immer bearbeiten
        if (isAdmin) {
          canUserEdit = true;
        } 
        // Eigenes Profil kann bearbeitet werden
        else if (user && targetUserId === user.uid) {
          // Benutzerrolle abrufen
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || null);
            
            // Holen Sie die Einstellungen, ob Benutzer ihre Arbeitszeiten bearbeiten dürfen
            const settingsDoc = await getDoc(doc(db, "settings", "features"));
            if (settingsDoc.exists()) {
              const settingsData = settingsDoc.data();
              
              // Prüfen, ob für die Benutzerrolle die Bearbeitung erlaubt ist
              if (settingsData.workHours && settingsData.workHours.canEdit) {
                if (
                  (userData.role === 'manager' && settingsData.workHours.canEdit.manager) ||
                  (userData.role === 'mitarbeiter' && settingsData.workHours.canEdit.mitarbeiter) ||
                  (userData.role === 'admin')
                ) {
                  canUserEdit = true;
                }
              } else {
                // Standardmäßig erlauben, wenn keine Einschränkungen definiert sind
                canUserEdit = true;
              }
            } else {
              // Standardmäßig erlauben, wenn keine Einstellungen vorhanden sind
              canUserEdit = true;
            }
          }
        }
        
        setCanEdit(canUserEdit && !readOnly);
      } catch (error) {
        console.error("Fehler beim Prüfen der Bearbeitungsrechte:", error);
        setCanEdit(false);
      }
    };
    
    checkEditPermissions();
  }, [user, targetUserId, isAdmin, readOnly]);
  
  // Laden der Vertragsdaten, falls vorhanden
  useEffect(() => {
    const loadContractData = async () => {
      if (!targetUserId) return;
      
      setIsLoading(true);
      try {
        const contract = await userContractService.getUserContract(targetUserId);
        
        if (contract) {
          setUserContract(contract);
          
          // Formular mit den geladenen Daten füllen
          form.reset({
            contractWorkHours: contract.contractWorkHours,
            workDaysPerWeek: contract.workDaysPerWeek,
            workDays: contract.workDays,
            vacationDaysPerYear: contract.vacationDaysPerYear,
            startDate: contract.startDate,
            // Schedule aus den Vertragsdaten laden, falls vorhanden
            schedule: contract.weeklySchedule ? 
              Object.fromEntries(
                Object.entries(contract.weeklySchedule).map(([day, details]) => [
                  day, 
                  { 
                    active: !!details, 
                    start: details?.start || "", 
                    end: details?.end || "",
                    hours: details?.hours || 0
                  }
                ])
              ) : undefined,
          });
        }
      } catch (error) {
        console.error("Fehler beim Laden der Vertragsdaten:", error);
        toast({
          title: "Fehler",
          description: "Die Vertragsdaten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    loadContractData();
  }, [targetUserId, form, toast]);
  
  // Speichern der Vertragsdaten
  const onSubmit = async (values: FormValues) => {
    if (!targetUserId) {
      toast({
        title: "Fehler",
        description: "Benutzer-ID fehlt. Bitte melden Sie sich erneut an.",
        variant: "destructive",
      });
      return;
    }
    
    if (!canEdit) {
      toast({
        title: "Zugriff verweigert",
        description: "Sie haben keine Berechtigung, diese Daten zu bearbeiten.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    try {
      // Wochenzeitplan in das richtige Format konvertieren
      const weeklySchedule = values.schedule ? 
        Object.fromEntries(
          Object.entries(values.schedule)
            .filter(([_, details]) => details.active)
            .map(([day, details]) => [
              day, 
              { 
                start: details.start || "09:00", 
                end: details.end || "17:00",
                hours: details.hours || 8
              }
            ])
        ) : {};
      
      // Vertragsdaten vorbereiten
      const contractData: Partial<UserContract> = {
        contractWorkHours: values.contractWorkHours,
        workDaysPerWeek: values.workDaysPerWeek,
        workDays: values.workDays,
        startDate: values.startDate || format(new Date(), 'yyyy-MM-dd'),
        vacationDaysPerYear: values.vacationDaysPerYear,
        weeklySchedule
      };
      
      // Speichern über den UserContractService
      await userContractService.saveUserContract(targetUserId, contractData);
      
      const updatedContract: UserContract = {
        ...userContract as UserContract,
        ...contractData,
        userId: targetUserId,
        isActive: true,
        noticePeriodsWeeks: userContract?.noticePeriodsWeeks || 4,
        createdAt: userContract?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setUserContract(updatedContract);
      
      // Benachrichtige das Zeitkonto über Änderungen, falls Callback vorhanden
      if (onContractUpdated) {
        onContractUpdated(updatedContract);
      }
      
      toast({
        title: "Erfolg",
        description: "Die Arbeitszeiten wurden erfolgreich gespeichert.",
      });
      
      // Callback aufrufen, falls vorhanden
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Vertragsdaten:", error);
      toast({
        title: "Fehler",
        description: "Die Arbeitszeiten konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Aktualisieren der Arbeitstage basierend auf Änderungen an workDaysPerWeek
  const handleWorkDaysChange = (value: number) => {
    try {
      // Vermeiden Sie Rekursion, indem Sie den Guard setzen
      isUpdatingSchedule.current = true;
      
      // Standardwerte basierend auf der Anzahl der Tage
      let newWorkDays: string[] = [];
      
      if (value === 5) {
        newWorkDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
      } else if (value === 6) {
        newWorkDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      } else if (value === 7) {
        newWorkDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      } else if (value > 0 && value < 5) {
        // Für weniger als 5 Tage, nehmen wir die ersten N Tage der Woche
        newWorkDays = ["monday", "tuesday", "wednesday", "thursday", "friday"].slice(0, value);
      }
      
      // Setze den neuen Wert
      form.setValue("workDaysPerWeek", value);
      form.setValue("workDays", newWorkDays);
      
      // Aktualisieren Sie den Schedule manuell, ohne die Watch-Funktion zu verwenden
      updateScheduleForWorkDays(newWorkDays);
    } finally {
      // Immer den Guard zurücksetzen
      isUpdatingSchedule.current = false;
    }
  };
  
  // Aktualisiere den Schedule manuell, basierend auf den Arbeitstagen
  const updateScheduleForWorkDays = (workDays: string[]) => {
    if (workDays.length === 0) return;
    
    try {
      // Setzt den Guard, um Rekursion zu vermeiden
      isUpdatingSchedule.current = true;
      
      const totalHours = form.getValues("contractWorkHours");
      const hoursPerDay = Math.round((totalHours / workDays.length) * 100) / 100;
      
      // Aktueller Schedule
      const currentSchedule = form.getValues("schedule") || {};
      const updatedSchedule = { ...currentSchedule };
      
      // Für jeden Wochentag
      WEEKDAYS.forEach(day => {
        const isWorkDay = workDays.includes(day.id);
        
        updatedSchedule[day.id] = {
          ...updatedSchedule[day.id],
          active: isWorkDay,
          hours: isWorkDay ? hoursPerDay : 0,
          start: isWorkDay ? (updatedSchedule[day.id]?.start || "09:00") : "",
          end: isWorkDay ? (updatedSchedule[day.id]?.end || "17:00") : "",
        };
      });
      
      // Setze den Schedule mit minimal möglichen Optionen
      form.setValue("schedule", updatedSchedule, { 
        shouldValidate: false,
        shouldDirty: true,
        shouldTouch: false
      });
    } finally {
      // Stelle sicher, dass der Guard zurückgesetzt wird
      isUpdatingSchedule.current = false;
    }
  };
  
  // Wenn ein Arbeitstag ausgewählt/abgewählt wird
  const handleWorkDayChange = (day: string, checked: boolean) => {
    const currentWorkDays = form.getValues("workDays") || [];
    
    let newWorkDays: string[];
    if (checked) {
      // Tag hinzufügen, wenn er noch nicht vorhanden ist
      newWorkDays = [...currentWorkDays, day];
    } else {
      // Tag entfernen
      newWorkDays = currentWorkDays.filter(d => d !== day);
    }
    
    // Setze die neuen Arbeitstage
    form.setValue("workDays", newWorkDays);
    form.setValue("workDaysPerWeek", newWorkDays.length);
    
    // Aktualisiere den Schedule
    updateScheduleForWorkDays(newWorkDays);
  };

  // Liste der verfügbaren Arbeitstage-Optionen
  const workDaysOptions = [
    { value: "1", label: "1 Tag" },
    { value: "2", label: "2 Tage" },
    { value: "3", label: "3 Tage" },
    { value: "4", label: "4 Tage" },
    { value: "5", label: "5 Tage" },
    { value: "6", label: "6 Tage" },
    { value: "7", label: "7 Tage" }
  ];
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          Arbeitszeiten
          {userRole && (
            <Badge variant="outline" className="ml-2">
              {userRole === 'admin' ? 'Administrator' : 
               userRole === 'manager' ? 'Manager' : 'Mitarbeiter'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {canEdit 
            ? "Legen Sie Ihre individuellen Arbeitszeiten fest - diese werden für die Zeiterfassung verwendet"
            : "Ansicht Ihrer aktuellen Arbeitszeiten"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canEdit && !isLoading && (
          <Alert className="mb-6">
            <AlertTitle>Nur Ansicht</AlertTitle>
            <AlertDescription>
              Sie können diese Arbeitszeiten nur einsehen, aber nicht bearbeiten. Wenden Sie sich an Ihren Administrator, um Änderungen vorzunehmen.
            </AlertDescription>
          </Alert>
        )}
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="contractWorkHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Wöchentliche Arbeitsstunden
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          field.onChange(value);
                          
                          // Wenn der Wert geändert wurde und gültig ist, aktualisiere den Schedule
                          if (!isNaN(value) && value > 0) {
                            const workDays = form.getValues("workDays") || [];
                            if (workDays.length > 0) {
                              updateScheduleForWorkDays(workDays);
                            }
                          }
                        }}
                        disabled={!canEdit || isLoading}
                      />
                    </FormControl>
                    <FormDescription>
                      Die von Ihnen vereinbarte wöchentliche Arbeitszeit.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="workDaysPerWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Arbeitstage pro Woche
                    </FormLabel>
                    
                    {/* Ersetzen des Select mit einer einfacheren Auswahl zur Vermeidung der unendlichen Aktualisierungsschleife */}
                    <div className="flex flex-wrap gap-2">
                      {workDaysOptions.map(option => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={field.value === parseInt(option.value) ? "default" : "outline"}
                          onClick={() => handleWorkDaysChange(parseInt(option.value))}
                          disabled={!canEdit || isLoading}
                          className="min-w-[80px]"
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    
                    <FormDescription>
                      Anzahl der Tage, an denen Sie in der Woche arbeiten.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="space-y-4">
              <FormLabel className="text-base">
                Arbeitstage
              </FormLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
                {WEEKDAYS.map((day) => {
                  const workDays = form.getValues("workDays") || [];
                  const isChecked = workDays.includes(day.id);
                  
                  return (
                    <Button
                      key={day.id}
                      type="button"
                      variant={isChecked ? "default" : "outline"}
                      onClick={() => {
                        if (canEdit && !isLoading) {
                          handleWorkDayChange(day.id, !isChecked);
                        }
                      }}
                      disabled={!canEdit || isLoading}
                      className="h-auto py-2 justify-start"
                    >
                      <span className="ml-1">{day.label}</span>
                    </Button>
                  );
                })}
              </div>
              <FormDescription>
                Wählen Sie die Tage aus, an denen Sie normalerweise arbeiten. Ihre Wochenarbeitszeit wird gleichmäßig auf diese Tage verteilt.
              </FormDescription>
            </div>

            {/* Erweiterte Einstellungen für den detaillierten Zeitplan */}
            <div className="pt-4">
              <div 
                className="flex items-center gap-2 mb-4"
              >
                <Switch 
                  checked={showAdvancedSettings} 
                  onCheckedChange={(value) => setShowAdvancedSettings(value)}
                />
                <Label 
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="cursor-pointer"
                >
                  Erweiterte Einstellungen anzeigen
                </Label>
              </div>
              
              {showAdvancedSettings && (
                <>
                  <Separator className="mb-6" />
                  
                  <Accordion type="single" collapsible defaultValue="wochenplan">
                    <AccordionItem value="wochenplan">
                      <AccordionTrigger>
                        <div className="text-lg font-medium">
                          Detaillierter Wochenplan
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pt-4 space-y-4">
                          <p className="text-sm text-muted-foreground mb-4">
                            Legen Sie Ihre täglichen Arbeitszeiten fest. Die Stunden werden automatisch basierend auf Ihrer wöchentlichen Arbeitszeit berechnet, können aber bei Bedarf angepasst werden.
                          </p>
                          
                          <div className="space-y-4">
                            {WEEKDAYS.map((day) => {
                              const workDays = form.getValues("workDays") || [];
                              const isWorkDay = workDays.includes(day.id);
                              const schedule = form.getValues("schedule") || {};
                              const daySchedule = schedule[day.id] || { active: false };
                              
                              return (
                                <div 
                                  key={day.id} 
                                  className={`grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-3 rounded-md border ${
                                    daySchedule.active ? 'bg-primary/5 border-primary/20' : ''
                                  }`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <Switch
                                      checked={daySchedule.active}
                                      onCheckedChange={(checked) => {
                                        if (!isUpdatingSchedule.current) {
                                          const updatedSchedule = { ...schedule };
                                          updatedSchedule[day.id] = {
                                            ...updatedSchedule[day.id],
                                            active: checked,
                                            start: checked ? (updatedSchedule[day.id]?.start || "09:00") : "",
                                            end: checked ? (updatedSchedule[day.id]?.end || "17:00") : "",
                                            hours: checked ? (updatedSchedule[day.id]?.hours || 8) : 0
                                          };
                                          form.setValue("schedule", updatedSchedule);
                                        }
                                      }}
                                      disabled={!canEdit || isLoading || !isWorkDay}
                                    />
                                    <Label className="font-medium">
                                      {day.label}
                                    </Label>
                                  </div>
                                  
                                  <div>
                                    <FormLabel>Arbeitsstart</FormLabel>
                                    <Input
                                      type="time"
                                      value={daySchedule.start || ""}
                                      onChange={(e) => {
                                        if (!isUpdatingSchedule.current) {
                                          const updatedSchedule = { ...schedule };
                                          updatedSchedule[day.id] = {
                                            ...updatedSchedule[day.id],
                                            start: e.target.value
                                          };
                                          form.setValue("schedule", updatedSchedule);
                                        }
                                      }}
                                      disabled={!canEdit || isLoading || !daySchedule.active}
                                    />
                                  </div>
                                  
                                  <div>
                                    <FormLabel>Arbeitsende</FormLabel>
                                    <Input
                                      type="time"
                                      value={daySchedule.end || ""}
                                      onChange={(e) => {
                                        if (!isUpdatingSchedule.current) {
                                          const updatedSchedule = { ...schedule };
                                          updatedSchedule[day.id] = {
                                            ...updatedSchedule[day.id],
                                            end: e.target.value
                                          };
                                          form.setValue("schedule", updatedSchedule);
                                        }
                                      }}
                                      disabled={!canEdit || isLoading || !daySchedule.active}
                                    />
                                  </div>
                                  
                                  <div>
                                    <FormLabel>Stunden</FormLabel>
                                    <Input
                                      type="number"
                                      step="0.5"
                                      value={daySchedule.hours || 0}
                                      onChange={(e) => {
                                        if (!isUpdatingSchedule.current) {
                                          const updatedSchedule = { ...schedule };
                                          updatedSchedule[day.id] = {
                                            ...updatedSchedule[day.id],
                                            hours: parseFloat(e.target.value) || 0
                                          };
                                          form.setValue("schedule", updatedSchedule);
                                        }
                                      }}
                                      disabled={!canEdit || isLoading || !daySchedule.active}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              )}
            </div>
            
            <Separator />
            
            {canEdit && (
              <CardFooter className="flex justify-end px-0 pt-4">
                <Button type="submit" disabled={isLoading || !canEdit}>
                  {isLoading ? "Speichern..." : "Arbeitszeiten speichern"}
                </Button>
              </CardFooter>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ContractHoursSettings; 