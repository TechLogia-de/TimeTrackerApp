import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format, parse } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, Clock, Plus, X, User, Users } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Shift, ShiftAssignment, ShiftTemplate } from "@/types/shifts";
import { User as UserType } from "@/types/types";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ShiftFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (shift: Shift) => void;
  shift?: Shift;
  date?: string;
  availableUsers?: UserType[];
  shiftTemplates?: ShiftTemplate[];
  role?: "admin" | "manager";
}

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

// Formular Schema
const formSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  date: z.date({
    required_error: "Datum ist erforderlich",
  }),
  startTime: timeSchema,
  endTime: timeSchema,
  notes: z.string().optional(),
  templateId: z.string().optional(),
  approvalDeadline: z.date().optional(),
});

// Zeit in 30-Minuten-Intervallen
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  return `${hour.toString().padStart(2, "0")}:${minute}`;
});

const ShiftForm: React.FC<ShiftFormProps> = ({
  open,
  onClose,
  onSave,
  shift,
  date,
  availableUsers = [],
  shiftTemplates = [],
  role = "admin",
}) => {
  const { user } = useAuth();
  const [selectedUsers, setSelectedUsers] = useState<ShiftAssignment[]>([]);
  const [availableUsersFiltered, setAvailableUsersFiltered] = useState<UserType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Erstellen des Formularobjekts
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: shift?.title || "",
      date: shift ? 
        (typeof shift.date === 'string' ? new Date(shift.date) : shift.date) : 
        date ? 
          (typeof date === 'string' ? 
            (date.includes('T') ? new Date(date) : parse(date, "yyyy-MM-dd", new Date())) : 
            date) : 
          new Date(),
      startTime: shift?.startTime || "09:00",
      endTime: shift?.endTime || "17:00",
      notes: shift?.notes || "",
      templateId: "",
      approvalDeadline: shift?.approvalDeadline ? new Date(shift.approvalDeadline) : 
        // Standard-Frist: 1 Tag vor dem Schichtdatum
        shift?.date 
          ? new Date(new Date(shift.date).setDate(new Date(shift.date).getDate() - 1)) 
          : date 
            ? (() => {
                const dateObj = typeof date === 'string' 
                  ? new Date(date) 
                  : date;
                return new Date(dateObj.setDate(dateObj.getDate() - 1));
              })()
            : new Date(new Date().setDate(new Date().getDate() + 2)), // Fallback: 2 Tage ab heute
    },
  });

  // Laden der zugewiesenen Benutzer
  useEffect(() => {
    if (shift) {
      setSelectedUsers(shift.assignedUsers || []);
    }
    // Filter auf verfügbare Benutzer anwenden
    filterAvailableUsers("");
  }, [shift, availableUsers]);

  // Filtern der verfügbaren Benutzer
  const filterAvailableUsers = (search: string) => {
    setSearchTerm(search);
    const filteredUsers = availableUsers.filter((user) => {
      const alreadySelected = selectedUsers.some((selected) => selected.userId === user.id);
      const matchesSearch = user.displayName?.toLowerCase().includes(search.toLowerCase());
      return !alreadySelected && (search === "" || matchesSearch);
    });
    setAvailableUsersFiltered(filteredUsers);
  };

  // Hinzufügen eines Benutzers zur Schicht
  const addUser = (user: UserType, event?: React.MouseEvent) => {
    // Event-Propagation stoppen, um zu verhindern, dass der Dialog geschlossen wird
    if (event) {
      event.stopPropagation();
    }
    
    const newAssignment: ShiftAssignment = {
      userId: user.id,
      userName: user.displayName || user.email || "Unbekannter Benutzer",
      status: "assigned",
      notes: "",
    };
    setSelectedUsers([...selectedUsers, newAssignment]);
    // Aktualisiere gefilterte Liste
    filterAvailableUsers(searchTerm);
  };

  // Entfernen eines Benutzers aus der Schicht
  const removeUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter((u) => u.userId !== userId));
    // Aktualisiere gefilterte Liste
    filterAvailableUsers(searchTerm);
  };

  // Beim Absenden des Formulars
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Mitarbeiter werden nur von Admins und Managern zugewiesen
    if (selectedUsers.length === 0 && (role === "admin" || role === "manager")) {
      if (!window.confirm("Sind Sie sicher, dass Sie diese Schicht ohne zugewiesene Mitarbeiter speichern möchten?")) {
        return;
      }
    }

    // Bestätigungsdialog entfernt, da er nach jeder Mitarbeiterzuweisung erscheint

    const newShift: Shift = {
      id: shift?.id || `shift_${Date.now()}`,
      title: values.title,
      date: format(values.date, "yyyy-MM-dd"),
      startTime: values.startTime,
      endTime: values.endTime,
      assignedUsers: selectedUsers,
      notes: values.notes,
      approvalDeadline: values.approvalDeadline ? format(values.approvalDeadline, "yyyy-MM-dd") : undefined,
      createdBy: user?.uid || "unknown",
      createdAt: shift?.createdAt || new Date().toISOString(),
    };

    onSave(newShift);
    onClose();
  };

  // Schichtvorlage anwenden
  const applyTemplate = (templateId: string) => {
    const template = shiftTemplates.find((t) => t.id === templateId);
    if (template) {
      form.setValue("title", template.title);
      form.setValue("startTime", template.startTime);
      form.setValue("endTime", template.endTime);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Wenn der Dialog geschlossen wird (isOpen = false), 
        // dann rufen wir onClose auf
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {shift ? "Schicht bearbeiten" : "Neue Schicht erstellen"}
          </DialogTitle>
          <DialogDescription>
            Füllen Sie alle erforderlichen Felder aus und weisen Sie Mitarbeiter zu.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
              // Nur Submit verarbeiten, wenn tatsächlich der Submit-Button geklickt wurde
              const submitter = (e.nativeEvent as SubmitEvent).submitter;
              if (submitter && submitter.getAttribute('type') === 'submit') {
                form.handleSubmit(onSubmit)(e);
              } else {
                // Verhindere unbeabsichtigtes Absenden des Formulars
                e.preventDefault();
              }
            }} 
            className="space-y-4"
          >
            {/* Vorlagen-Auswahl, wenn vorhanden */}
            {shiftTemplates.length > 0 && (
              <FormField
                control={form.control}
                name="templateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schichtvorlage verwenden</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        applyTemplate(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Wählen Sie eine Vorlage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {shiftTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.title} ({template.startTime} - {template.endTime})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Schichtvorlagen erleichtern die Erstellung wiederkehrender Schichten.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Titel der Schicht */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schichttitel</FormLabel>
                  <FormControl>
                    <Input placeholder="z.B. Frühschicht" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Datum der Schicht */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Datum</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "pl-3 text-left font-normal",
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
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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

            {/* Notizen */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Zusätzliche Informationen zur Schicht"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Genehmigungsfrist (nur für admin/manager) */}
            {(role === "admin" || role === "manager") && (
              <FormField
                control={form.control}
                name="approvalDeadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Genehmigungsfrist</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: de })
                            ) : (
                              <span>Frist auswählen</span>
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
                          initialFocus
                          disabled={(date) => date > new Date(form.getValues().date)}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Bis zu diesem Datum müssen Mitarbeiter die Schicht akzeptieren oder ablehnen.
                      Die Frist kann höchstens bis zum Tag der Schicht gesetzt werden.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Benutzer zuweisen (nur für admin/manager) */}
            {(role === "admin" || role === "manager") && (
              <div className="space-y-4 pt-2 border-t">
                <h3 className="font-medium">Mitarbeiter zuweisen</h3>

                {/* Ausgewählte Benutzer */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Zugewiesene Mitarbeiter ({selectedUsers.length})
                  </label>
                  {selectedUsers.length > 0 ? (
                    <div className="space-y-1">
                      {selectedUsers.map((assignment) => (
                        <div
                          key={`selected-${assignment.userId}`}
                          className="flex items-center justify-between bg-slate-50 p-2 rounded"
                        >
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-slate-300 mr-2 flex items-center justify-center">
                              {assignment.userName.substring(0, 2).toUpperCase()}
                            </div>
                            <span>{assignment.userName}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeUser(assignment.userId)}
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500 text-sm p-2 border rounded text-center">
                      Noch keine Mitarbeiter zugewiesen
                    </div>
                  )}
                </div>

                {/* Benutzer-Suche */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Verfügbare Mitarbeiter hinzufügen
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="Mitarbeiter suchen..."
                      value={searchTerm}
                      onChange={(e) => filterAvailableUsers(e.target.value)}
                      className="mb-2"
                    />
                    {availableUsersFiltered.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {availableUsersFiltered.map((user) => (
                          <div
                            key={`available-${user.id}`}
                            className="flex items-center justify-between bg-slate-50 p-2 rounded hover:bg-slate-100 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              addUser(user);
                            }}
                          >
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-slate-300 mr-2 flex items-center justify-center">
                                {(user.displayName || user.email || "??").substring(0, 2).toUpperCase()}
                              </div>
                              <span>{user.displayName || user.email}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                addUser(user);
                              }}
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-sm p-2 border rounded text-center">
                        Keine weiteren Mitarbeiter verfügbar
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button variant="outline" type="button" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit">Schicht speichern</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ShiftForm; 