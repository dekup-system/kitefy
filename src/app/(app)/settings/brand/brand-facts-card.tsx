"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { manageBrandFactAction } from "@/lib/onboarding/actions";
import type { EntityFact } from "@/types/domain";

export function BrandFactsCard({
  brandId,
  facts,
}: {
  brandId: string;
  facts: EntityFact[];
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editClaim, setEditClaim] = useState("");
  const [editSource, setEditSource] = useState("");
  const [newClaim, setNewClaim] = useState("");
  const [newSource, setNewSource] = useState("");

  function startEdit(index: number, fact: EntityFact) {
    setEditingIndex(index);
    setEditClaim(fact.claim);
    setEditSource(fact.source_url ?? "");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Diferenciais e fatos da marca (usados nos textos e GEO)</CardTitle>
        <CardDescription>
          Revise, edite ou recuse cada item abaixo. Diferenciais próprios da marca entram automaticamente em todos os conteúdos; link de fonte externa é opcional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum diferencial ou fato cadastrado ainda. Adicione os principais recursos e provas da sua marca abaixo para alcançar 100% na Saúde da Marca.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {facts.map((fact, index) => {
              const isEditing = editingIndex === index;
              return (
                <li
                  key={`${fact.claim}-${index}`}
                  className="rounded-lg border border-border bg-card p-3 text-sm"
                >
                  {isEditing ? (
                    <form
                      action={async (fd) => {
                        await manageBrandFactAction(fd);
                        setEditingIndex(null);
                      }}
                      className="space-y-2.5"
                    >
                      <input type="hidden" name="brandId" value={brandId} />
                      <input type="hidden" name="mode" value="update" />
                      <input type="hidden" name="index" value={String(index)} />
                      <Input
                        name="claim"
                        value={editClaim}
                        onChange={(e) => setEditClaim(e.target.value)}
                        required
                        minLength={3}
                        maxLength={220}
                        placeholder="Texto do diferencial ou fato"
                      />
                      <Input
                        name="sourceUrl"
                        type="url"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        placeholder="Link de fonte externa (opcional — https://...)"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm">
                          <Check className="size-3.5" aria-hidden="true" />
                          Aplicar correção
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingIndex(null)}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{fact.claim}</p>
                        {fact.source_url ? (
                          <a
                            href={fact.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block break-all text-xs text-muted-foreground underline underline-offset-4"
                          >
                            Fonte externa: {fact.source_url}
                          </a>
                        ) : (
                          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                            Diferencial próprio da marca — incluído automaticamente nos conteúdos.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(index, fact)}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Corrigir
                        </Button>
                        <form action={manageBrandFactAction}>
                          <input type="hidden" name="brandId" value={brandId} />
                          <input type="hidden" name="mode" value="delete" />
                          <input type="hidden" name="index" value={String(index)} />
                          <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            Recusar
                          </Button>
                        </form>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form
          action={async (fd) => {
            await manageBrandFactAction(fd);
            setNewClaim("");
            setNewSource("");
          }}
          className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-3"
        >
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="mode" value="add" />
          <p className="text-xs font-medium text-foreground">Adicionar novo diferencial ou fato</p>
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
            <Input
              name="claim"
              value={newClaim}
              onChange={(e) => setNewClaim(e.target.value)}
              required
              minLength={3}
              maxLength={220}
              placeholder="Ex.: Edição Linear Multicam com sincronismo inteligente"
            />
            <Input
              name="sourceUrl"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="Fonte opcional (https://...)"
            />
            <Button type="submit" size="sm" variant="outline">
              <Plus className="size-3.5" aria-hidden="true" />
              Adicionar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
