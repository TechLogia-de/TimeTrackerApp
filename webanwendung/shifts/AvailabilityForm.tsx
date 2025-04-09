import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Save, Trash2 } from "lucide-react";
import { Availability } from "@/types/shifts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useAuth } from "@/lib/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Zeitvalidierung Schema
const timeSchema = z.string().refine(
  (time) => {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
  },
  {
    message: "Gültige Zeit im Format HH:MM erforderlich",
  }
);

// Formular Schema für Verfügbarkeit
const availabilityFormSchema = z.object({
  weekDay: z.number().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  recurring: z.boolean().default(true),
  notes: z.string().optional(),
});

interface AvailabilityFormProps {
  availabilities: Availability[];
  onSave: (availabilities: Availability[]) => void;
}

// Zeit in 30-Minuten-Intervallen
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${minute}`;
});

// Wochentage
const weekDays = [
  { label: "Sonntag", value: 0 },
  { label: "Montag", value: 1 },
  { label: "Dienstag", value: 2 },
  { label: "Mittwoch", value: 3 },
  { label: "Donnerstag", value: 4 },
  { label: "Freitag", value: 5 },
  { label: "Samstag", value: 6 },
];

const AvailabilityForm: React.FC<AvailabilityFormProps> = ({
  availabilities = [],
  onSave,
}) => {
  const { user } = useAuth();
  const [userAvailabilities, setUserAvailabilities] = useState<Availability[]>(availabilities);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [currentAvailability, setCurrentAvailability] = useState<Availability | null>(null);
  const [editIndex, setEditIndex] = useState<number>(-1);

  const form = useForm<z.infer<typeof availabilityFormSchema>>({
    resolver: zodResolver(availabilityFormSchema),
    defaultValues: {
      weekDay: 1, // Montag als Standard
      startTime: "09:00",
      endTime: "17:00",
      recurring: true,
      notes: "",
    },
  });

  // Formular zurücksetzen und in Bearbeitungsmodus wechseln
  const startEditing = (availability?: Availability, index?: number) => {
    if (availability) {
      form.reset({
        weekDay: availability.weekDay,
        startTime: availability.startTime,
        endTime: availability.endTime,
        recurring: availability.recurring,
        notes: availability.notes || "",
      });
      setCurrentAvailability(availability);
      setEditIndex(index || -1);
    } else {
      form.reset({
        weekDay: 1,
        startTime: "09:00",
        endTime: "17:00",
        recurring: true,
        notes: "",
      });
      setCurrentAvailability(null);
      setEditIndex(-1);
    }
    setIsEditing(true);
  };

  // Verfügbarkeit löschen
  const deleteAvailability = (index: number) => {
    const newAvailabilities = [...userAvailabilities];
    newAvailabilities.splice(index, 1);
    setUserAvailabilities(newAvailabilities);
    onSave(newAvailabilities);
  };

  // Formular absenden
  const onSubmit = (values: z.infer<typeof availabilityFormSchema>) => {
    const newAvailability: Availability = {
      id: currentAvailability?.id || `avail_${Date.now()}`,
      userId: user?.uid || "unknown",
      userName: user?.displayName || "Unbekannter Benutzer",
      weekDay: values.weekDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startTime: values.startTime,
      endTime: values.endTime,
      recurring: values.recurring,
      notes: values.notes,
    };

    let newAvailabilities = [...userAvailabilities];
    
    if (editIndex >= 0) {
      // Bearbeiten einer vorhandenen Verfügbarkeit
      newAvailabilities[editIndex] = newAvailability;
    } else {
      // Neue Verfügbarkeit hinzufügen
      newAvailabilities.push(newAvailability);
    }
    
    // Nach Wochentag sortieren
    newAvailabilities.sort((a, b) => a.weekDay - b.weekDay);
    
    setUserAvailabilities(newAvailabilities);
    onSave(newAvailabilities);
    setIsEditing(false);
  };

  // Hilfsfunktion zum Anzeigen des Wochentagsnamens
  const getWeekDayName = (day: number) => {
    return weekDays.find(d => d.value === day)?.label || "Unbekannt";
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Meine Verfügbarkeit</CardTitle>
        <CardDescription>
          Geben Sie an, an welchen Tagen und zu welchen Zeiten Sie verfügbar sind.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <>
            {userAvailabilities.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userAvailabilities.map((availability, index) => (
                    <Card key={availability.id} className="border shadow-sm">
                      <CardHeader className="py-3 px-4">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg">
                            {getWeekDayName(availability.weekDay)}
                          </CardTitle>
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => startEditing(availability, index)}
                            >
                              Bearbeiten
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => deleteAvailability(index)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="py-2 px-4">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center text-sm">
                            <span className="font-medium">Zeit:</span>
                            <span className="ml-2">{availability.startTime} - {availability.endTime}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="font-medium">Wiederkehrend:</span>
                            <span className="ml-2">{availability.recurring ? "Ja" : "Nein"}</span>
                          </div>
                          {availability.notes && (
                            <div className="text-sm mt-1">
                              <span className="font-medium">Hinweis:</span>
                              <p className="text-slate-600 mt-1">{availability.notes}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={() => startEditing()}
                >
                  Weitere Verfügbarkeit hinzufügen
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium mb-2">Keine Verfügbarkeit angegeben</h3>
                <p className="text-slate-500 mb-4">
                  Bitte geben Sie Ihre Verfügbarkeit an, damit Ihnen Schichten zugewiesen werden können.
                </p>
                <Button onClick={() => startEditing()}>
                  Verfügbarkeit hinzufügen
                </Button>
              </div>
            )}
          </>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Wichtig</AlertTitle>
                <AlertDescription>
                  Bitte beachten Sie, dass Ihre angegebene Verfügbarkeit für die Schichtplanung verwendet wird.
                </AlertDescription>
              </Alert>

              {/* Wochentag */}
              <FormField
                control={form.control}
                name="weekDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wochentag</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))} 
                      value={field.value.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen Sie einen Wochentag" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {weekDays.map((day) => (
                          <SelectItem key={day.value} value={day.value.toString()}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Startzeit */}
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Startzeit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen Sie eine Startzeit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map((time) => (
                          <SelectItem key={`start-${time}`} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <FormLabel>Endzeit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen Sie eine Endzeit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map((time) => (
                          <SelectItem key={`end-${time}`} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Wiederkehrend */}
              <FormField
                control={form.control}
                name="recurring"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Wiederkehrend</FormLabel>
                      <FormDescription>
                        Gilt diese Verfügbarkeit jede Woche?
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

              {/* Notizen */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hinweise</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Zusätzliche Informationen zu Ihrer Verfügbarkeit"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Besonderheiten oder Einschränkungen können hier vermerkt werden.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => setIsEditing(false)}
                >
                  Abbrechen
                </Button>
                <Button type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  Speichern
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
};

export default AvailabilityForm; 