import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { differenceInCalendarDays, format, isWeekend, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { AbsenceService } from "@/lib/services/absenceService";
import { AbsenceType, AbsenceFormData, AbsenceStatus } from "@/types/absence";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CalendarCheck } from "lucide-react";

// Schema für die Validierung des Formulars
const absenceFormSchema = z.object({
  type: z.nativeEnum(AbsenceType, {
    required_error: "Bitte wählen Sie einen Abwesenheitstyp aus",
  }),
  startDate: z.date({
    required_error: "Bitte wählen Sie ein Startdatum aus",
  }),
  endDate: z.date({
    required_error: "Bitte wählen Sie ein Enddatum aus",
  }),
  halfDayStart: z.boolean().default(false),
  halfDayEnd: z.boolean().default(false),
  reason: z.string().optional(),
  notes: z.string().optional(),
  documents: z.array(z.string()).optional(),
}).refine(data => {
  return data.endDate >= data.startDate;
}, {
  message: "Enddatum muss nach dem Startdatum liegen",
  path: ["endDate"],
}).refine(data => {
  // Prüfen ob Start- und Enddatum im selben Jahr sind
  return new Date(data.startDate).getFullYear() === new Date(data.endDate).getFullYear();
}, {
  message: "Start- und Enddatum müssen im selben Jahr liegen",
  path: ["endDate"],
});

type AbsenceFormProps = {
  initialData?: Partial<AbsenceFormData>;
  absenceId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  isEdit?: boolean;
};

const AbsenceForm = ({
  initialData,
  absenceId,
  onSuccess,
  onCancel,
  isEdit = false,
}: AbsenceFormProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workDays, setWorkDays] = useState(0);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Formular initialisieren
  const form = useForm<z.infer<typeof absenceFormSchema>>({
    resolver: zodResolver(absenceFormSchema),
    defaultValues: {
      type: initialData?.type || AbsenceType.VACATION,
      startDate: initialData?.startDate || new Date(),
      endDate: initialData?.endDate || new Date(),
      halfDayStart: initialData?.halfDayStart || false,
      halfDayEnd: initialData?.halfDayEnd || false,
      reason: initialData?.reason || "",
      notes: initialData?.notes || "",
      documents: initialData?.documents?.map(doc => doc instanceof File ? URL.createObjectURL(doc) : doc) || [],
    },
  });
  
  // Arbeitstage berechnen, wenn sich die Daten ändern
  useEffect(() => {
    const startDate = form.watch("startDate");
    const endDate = form.watch("endDate");
    const halfDayStart = form.watch("halfDayStart");
    const halfDayEnd = form.watch("halfDayEnd");
    
    if (startDate && endDate) {
      // Arbeitstage berechnen (exklusive Wochenenden)
      let days = 0;
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        if (!isWeekend(currentDate)) {
          days += 1;
        }
        currentDate = addDays(currentDate, 1);
      }
      
      // Abzug für halbe Tage
      if (halfDayStart) days -= 0.5;
      if (halfDayEnd) days -= 0.5;
      
      setWorkDays(Math.max(days, 0));
    }
  }, [form.watch("startDate"), form.watch("endDate"), form.watch("halfDayStart"), form.watch("halfDayEnd")]);
  
  // Formular abschicken
  const onSubmit = async (values: z.infer<typeof absenceFormSchema>) => {
    if (!user) {
      toast({
        title: "Fehler",
        description: "Sie müssen angemeldet sein, um einen Abwesenheitsantrag zu stellen",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prüfen auf überlappende Abwesenheiten
      const existingAbsences = await AbsenceService.getUserAbsences(user.uid);
      const overlappingAbsence = existingAbsences.find(absence => 
        // Nicht derselbe Eintrag bei Bearbeitung
        (!isEdit || absence.id !== absenceId) &&
        // Nur prüfen, wenn Abwesenheit nicht abgelehnt oder storniert ist
        (absence.status !== AbsenceStatus.REJECTED && absence.status !== AbsenceStatus.CANCELLED) &&
        // Überprüfung auf Überlappung
        ((new Date(values.startDate) <= new Date(absence.endDate) && 
         new Date(values.endDate) >= new Date(absence.startDate)))
      );

      if (overlappingAbsence) {
        toast({
          title: "Terminkonflikt",
          description: "Es existiert bereits eine Abwesenheit in diesem Zeitraum.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      // Konvertiere String-URLs zurück zu File-Objekten für den API-Aufruf
      const formDataWithFiles: AbsenceFormData = {
        ...values,
        documents: undefined // Setze documents auf undefined, da wir keine File-Objekte haben
      };
      
      if (isEdit && absenceId) {
        // Bestehenden Antrag aktualisieren
        await AbsenceService.updateAbsence(absenceId, formDataWithFiles);
        toast({
          title: "Abwesenheitsantrag aktualisiert",
          description: "Ihr Abwesenheitsantrag wurde erfolgreich aktualisiert",
        });
      } else {
        // Neuen Antrag erstellen
        await AbsenceService.createAbsence(
          formDataWithFiles,
          user.uid,
          user.displayName || "Unbekannter Benutzer",
          user.email || "Keine E-Mail"
        );
        toast({
          title: "Abwesenheitsantrag eingereicht",
          description: "Ihr Abwesenheitsantrag wurde erfolgreich eingereicht",
        });
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Fehler beim Speichern des Abwesenheitsantrags:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern des Abwesenheitsantrags ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Beschreibungstext je nach Abwesenheitstyp
  const getTypeDescription = (type: AbsenceType) => {
    switch (type) {
      case AbsenceType.VACATION:
        return "Urlaub wird vom Urlaubskonto abgebucht";
      case AbsenceType.SICK:
        return "Krankheit (mit ärztlicher Bescheinigung)";
      case AbsenceType.SPECIAL:
        return "Sonderurlaub (z.B. Hochzeit, Geburt, Todesfall)";
      case AbsenceType.REMOTE:
        return "Homeoffice / Remote-Arbeit";
      case AbsenceType.OTHER:
        return "Sonstige Abwesenheit";
      default:
        return "Sonstige Abwesenheit";
    }
  };
  
  // Dialog zum Bestätigen des Absendens
  const handleSubmit = () => {
    if (form.formState.isValid) {
      setShowConfirmDialog(true);
    } else {
      form.handleSubmit(onSubmit)();
    }
  };
  
  return (
    <>
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>
            {isEdit ? "Abwesenheitsantrag bearbeiten" : "Neuen Abwesenheitsantrag stellen"}
          </CardTitle>
          <CardDescription>
            Erfassen Sie Ihre Urlaubstage, Krankheitstage oder sonstige Abwesenheiten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <div className="space-y-6">
              {/* Abwesenheitstyp */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium">Abwesenheitstyp</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Wählen Sie einen Abwesenheitstyp" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={AbsenceType.VACATION}>Urlaub</SelectItem>
                        <SelectItem value={AbsenceType.SICK}>Krankheit</SelectItem>
                        <SelectItem value={AbsenceType.SPECIAL}>Sonderurlaub</SelectItem>
                        <SelectItem value={AbsenceType.REMOTE}>Homeoffice</SelectItem>
                        <SelectItem value={AbsenceType.OTHER}>Sonstiges</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>{getTypeDescription(form.watch("type"))}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Startdatum & Enddatum in 2-Spalten-Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Startdatum */}
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="font-medium">Startdatum</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal bg-background",
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
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Enddatum */}
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="font-medium">Enddatum</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal bg-background",
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
                            disabled={(date) => date < form.watch("startDate")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Halbe Tage Optionen */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="halfDayStart"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Halber erster Tag</FormLabel>
                        <FormDescription>
                          Nur halber Tag am Startdatum
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="halfDayEnd"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Halber letzter Tag</FormLabel>
                        <FormDescription>
                          Nur halber Tag am Enddatum
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* Arbeitstage-Anzeige */}
              <div className="bg-muted p-4 rounded-md">
                <div className="flex items-center space-x-2">
                  <CalendarCheck className="h-5 w-5 text-primary" />
                  <span className="font-medium">Arbeitstage:</span>
                  <Badge variant="secondary" className="text-base">
                    {workDays} {workDays === 1 ? "Tag" : "Tage"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Wochenenden werden automatisch ausgeschlossen
                </p>
              </div>

              {/* Grund */}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grund der Abwesenheit</FormLabel>
                    <FormControl>
                      <Input placeholder="Grund (optional)" {...field} />
                    </FormControl>
                    <FormDescription>
                      Geben Sie einen kurzen Grund für Ihre Abwesenheit an
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notizen */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Weitere Informationen (optional)"
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Hinweise zur besseren Einordnung Ihrer Abwesenheit
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Dokumenten-Upload könnte hier hinzugefügt werden */}
              
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
            onClick={handleSubmit}
            disabled={!form.formState.isValid || isSubmitting}
          >
            {isSubmitting ? "Wird gespeichert..." : isEdit ? "Aktualisieren" : "Absenden"}
          </Button>
        </CardFooter>
      </Card>

      {/* Bestätigungsdialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogTitle>Abwesenheitsantrag bestätigen</DialogTitle>
          <DialogDescription>
            Möchten Sie den folgenden Abwesenheitsantrag {isEdit ? "aktualisieren" : "einreichen"}?
          </DialogDescription>
          
          <div className="space-y-4 my-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm font-medium">Typ:</div>
              <div className="text-sm">
                {form.watch("type") === AbsenceType.VACATION && "Urlaub"}
                {form.watch("type") === AbsenceType.SICK && "Krankheit"}
                {form.watch("type") === AbsenceType.SPECIAL && "Sonderurlaub"}
                {form.watch("type") === AbsenceType.REMOTE && "Homeoffice"}
                {form.watch("type") === AbsenceType.OTHER && "Sonstiges"}
              </div>
              
              <div className="text-sm font-medium">Zeitraum:</div>
              <div className="text-sm">
                {format(form.watch("startDate"), "dd.MM.yyyy")} - {format(form.watch("endDate"), "dd.MM.yyyy")}
                {(form.watch("halfDayStart") || form.watch("halfDayEnd")) && " ("}
                {form.watch("halfDayStart") && "halber erster Tag"}
                {form.watch("halfDayStart") && form.watch("halfDayEnd") && ", "}
                {form.watch("halfDayEnd") && "halber letzter Tag"}
                {(form.watch("halfDayStart") || form.watch("halfDayEnd")) && ")"}
              </div>
              
              <div className="text-sm font-medium">Arbeitstage:</div>
              <div className="text-sm">{workDays} {workDays === 1 ? "Tag" : "Tage"}</div>
              
              {form.watch("reason") && (
                <>
                  <div className="text-sm font-medium">Grund:</div>
                  <div className="text-sm">{form.watch("reason")}</div>
                </>
              )}
            </div>
            
            {form.watch("type") === AbsenceType.VACATION && (
              <Alert variant="default" className="bg-amber-50">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Hinweis zum Urlaubskonto</AlertTitle>
                <AlertDescription>
                  Nach Genehmigung werden {workDays} {workDays === 1 ? "Tag" : "Tage"} von Ihrem Urlaubskonto abgezogen.
                </AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmDialog(false)}
            >
              Zurück
            </Button>
            <Button 
              onClick={form.handleSubmit(onSubmit)} 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Wird gespeichert..." : "Bestätigen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AbsenceForm; 