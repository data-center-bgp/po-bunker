// Command admin is the operator's tool for things the web app cannot do yet,
// mainly creating the first admin on a fresh database.
//
//	admin create-user -email a@b.com -name "Ada Admin" -role admin [-password-stdin]
//	admin set-password -email a@b.com [-password-stdin]
//
// Without -password-stdin a random password is generated and printed once.
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/data-center-bgp/po-bunker/backend/internal/auth"
	"github.com/data-center-bgp/po-bunker/backend/internal/config"
	"github.com/data-center-bgp/po-bunker/backend/internal/users"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: admin create-user|set-password [flags]")
	}
	cmd, rest := args[0], args[1:]

	fs := flag.NewFlagSet(cmd, flag.ContinueOnError)
	email := fs.String("email", "", "user email")
	name := fs.String("name", "", "display name (create-user)")
	role := fs.String("role", "staff", "admin, staff or viewer (create-user)")
	stdin := fs.Bool("password-stdin", false, "read the password from stdin instead of generating one")
	if err := fs.Parse(rest); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("-email is required")
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("configuration: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	store := users.NewStore(pool)

	password, generated, err := readPassword(*stdin)
	if err != nil {
		return err
	}
	hash, err := auth.HashPassword(password, auth.BcryptCost)
	if err != nil {
		return err
	}

	switch cmd {
	case "create-user":
		r := users.Role(*role)
		if !r.Valid() {
			return fmt.Errorf("-role must be admin, staff or viewer, got %q", *role)
		}
		if strings.TrimSpace(*name) == "" {
			return errors.New("-name is required")
		}
		u, err := store.Create(ctx, users.NewUser{Name: *name, Email: *email, Role: r, PasswordHash: hash})
		if errors.Is(err, users.ErrEmailTaken) {
			return fmt.Errorf("%s already has an account", users.NormalizeEmail(*email))
		}
		if err != nil {
			return err
		}
		fmt.Printf("created %s (%s) with role %s\n", u.Email, u.Name, u.Role)
	case "set-password":
		u, err := store.GetByEmail(ctx, *email)
		if err != nil {
			return fmt.Errorf("no user with email %s", users.NormalizeEmail(*email))
		}
		if err := store.SetPassword(ctx, u.ID, hash); err != nil {
			return err
		}
		// Existing sessions must not survive a password reset.
		if err := auth.NewRefreshStore(pool, time.Hour).RevokeAll(ctx, u.ID); err != nil {
			return err
		}
		fmt.Printf("password updated for %s; their sessions were ended\n", u.Email)
	default:
		return fmt.Errorf("unknown command %q (want create-user or set-password)", cmd)
	}

	if generated {
		fmt.Printf("generated password (shown once): %s\n", password)
	}
	return nil
}

func readPassword(fromStdin bool) (password string, generated bool, err error) {
	if !fromStdin {
		p, err := auth.RandomPassword(20)
		return p, true, err
	}
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return "", false, errors.New("no password on stdin")
	}
	return strings.TrimRight(line, "\r\n"), false, nil
}
